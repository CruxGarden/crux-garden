const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const sync = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { buildSync } = require("../../../node_modules/esbuild");
let root, jsonArrayStream, visitReviewFile;
before(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-stream-test-")),
  );
  for (const name of ["json-array-stream", "review-files"]) {
    const outfile = path.join(root, name + ".cjs");
    buildSync({
      entryPoints: [path.resolve(__dirname, "../src", name + ".ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
    });
  }
  ({ jsonArrayStream } = require(path.join(root, "json-array-stream.cjs")));
  ({ visitReviewFile } = require(path.join(root, "review-files.cjs")));
});
after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const prefix = "window.YTD.tweets.part0 =";
function parse(bytes, chunk = 1, max, envelope = prefix) {
  const entries = [];
  const p = jsonArrayStream(
    envelope,
    (value, index) => {
      assert.equal(index, entries.length);
      entries.push(value);
    },
    max,
  );
  for (let n = 0; n < bytes.length; n += chunk)
    p.push(bytes.subarray(n, n + chunk));
  assert.equal(p.finish(), entries.length);
  return entries;
}
test("streamed JSON framing handles UTF-8, escapes, primitives and nested boundaries for every chunk size", () => {
  const values = [
    null,
    true,
    false,
    123,
    -0.125e30,
    '🌿 quote " slash \\ closing ] }, [',
    { a: [1, { text: '\\"},]🌿' }, false] },
    [],
    {},
  ];
  const bytes = Buffer.from(
    "\uFEFF " + prefix + " " + JSON.stringify(values) + ";\r\n",
  );
  for (const n of [1, 2, 3, 7, 31, 64, 65536])
    assert.deepEqual(parse(bytes, n), values);
  assert.deepEqual(parse(Buffer.from(prefix + " []")), []);
});
test("streamed JSON refuses executable tails, incomplete grammar, invalid UTF-8, excess entries and deep objects", () => {
  for (const value of [
    "[{} {}]",
    "[{},]",
    "[,{}]",
    "[{}] ; ;",
    "[{}] evil()",
    "[{} /* comment */]",
    "[undefined]",
    '[{"x":NaN}]',
    "[{}",
    "[{]",
    '[{"x":1,}]',
    '["a\n"]',
    "[01]",
  ])
    assert.throws(
      () => parse(Buffer.from(prefix + " " + value), 3),
      undefined,
      value,
    );
  assert.throws(() =>
    parse(
      Buffer.concat([
        Buffer.from(prefix + ' ["'),
        Buffer.from([255]),
        Buffer.from('"]'),
      ]),
    ),
  );
  assert.throws(() => parse(Buffer.from(prefix + " [\uFEFFnull]")));
  assert.throws(
    () => parse(Buffer.from(prefix + " [null,null]"), 1, 1),
    /Too many/,
  );
  assert.throws(
    () =>
      parse(
        Buffer.from(prefix + " [" + "[".repeat(129) + "0" + "]".repeat(130)),
      ),
    /nesting/,
  );
  assert.throws(
    () =>
      parse(Buffer.from(prefix + ' ["' + "a".repeat(1024 ** 2) + '"]'), 65536),
    /1 MiB/,
  );
  assert.throws(
    () => parse(Buffer.from(" ".repeat(257) + prefix + " []")),
    /envelope/,
  );
});
async function input(name, bytes = Buffer.alloc(150000, 65)) {
  await fs.writeFile(path.join(root, name), bytes);
  return {
    path: name,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
test("shared streaming reader bounds chunks, enforces receipt hashes and rejects symlinks and early limits", async () => {
  const file = await input("normal");
  let total = 0;
  await visitReviewFile(
    root,
    file,
    200000,
    () => {},
    (b) => {
      assert.ok(b.length <= 65536);
      total += b.length;
    },
  );
  assert.equal(total, file.size);
  await assert.rejects(
    visitReviewFile(
      root,
      { ...file, sha256: "0".repeat(64) },
      200000,
      () => {},
      () => {},
    ),
    /fingerprint/,
  );
  await assert.rejects(
    visitReviewFile(
      root,
      file,
      100,
      () => {},
      () => {
        throw Error("must not consume");
      },
    ),
    /limit/,
  );
  await fs.symlink(path.join(root, "normal"), path.join(root, "link"));
  await assert.rejects(
    visitReviewFile(
      root,
      { ...file, path: "link" },
      200000,
      () => {},
      () => {},
    ),
    /symlink|regular|unsafe|link/i,
  );
});
test("shared streaming reader rejects replacement, mutation, truncation, growth and supports cancellation", async () => {
  for (const mode of ["replace", "mutate", "truncate", "grow", "pause"]) {
    const file = await input(mode);
    let once = false,
      stopped = false;
    await assert.rejects(
      visitReviewFile(
        root,
        file,
        200000,
        () => {
          if (stopped) throw Error("paused fixture");
        },
        () => {
          if (once) return;
          once = true;
          const p = path.join(root, mode);
          if (mode === "replace") {
            sync.renameSync(p, p + "-old");
            sync.writeFileSync(p, Buffer.alloc(file.size, 65));
          }
          if (mode === "mutate") {
            const fd = sync.openSync(p, "r+");
            sync.writeSync(fd, Buffer.from("B"), 0, 1, 0);
            sync.closeSync(fd);
          }
          if (mode === "truncate") sync.truncateSync(p, 10);
          if (mode === "grow") sync.appendFileSync(p, "more");
          if (mode === "pause") stopped = true;
        },
      ),
      /changed|fingerprint|ended|paused/,
    );
  }
});

test("plain JSON array mode has a strict envelope distinct from script assignments", () => {
  const values = [
    { title: '🌿 ] } " \\', media: [{ uri: "media/video" }] },
    null,
  ];
  const bytes = Buffer.from(" \r\n\t" + JSON.stringify(values) + "\n ");
  for (const n of [1, 2, 7, 65536])
    assert.deepEqual(parse(bytes, n, undefined, null), values);
  for (const input of [
    "[];",
    "\uFEFF[]",
    "window.YTD.tweets.part0 = []",
    "[] /*comment*/",
    "() => []",
    "[{},]",
    "\v[]",
    "\f[]",
    "[\uFEFFnull]",
    "{}",
  ])
    assert.throws(
      () => parse(Buffer.from(input), 1, undefined, null),
      undefined,
      input,
    );
});

test("streaming framer processes over 64MiB and 100000 entries in a separate 32MiB heap process", () => {
  const { spawnSync } = require("node:child_process");
  const code = `const assert=require('node:assert/strict');
    const {jsonArrayStream}=require(${JSON.stringify(path.join(root, "json-array-stream.cjs"))});
    let count=0,bytes=0;
    const p=jsonArrayStream(null,(v,index)=>{assert.equal(index,count++);assert.equal(v.text.length,768)});
    const item=JSON.stringify({text:'x'.repeat(768)}),block=Buffer.from(Array(1000).fill(item).join(',')+',');
    const push=b=>{bytes+=b.length;p.push(b)};
    push(Buffer.from('['));for(let i=0;i<99;i++)push(block);
    push(Buffer.from(Array(1000).fill(item).join(',')+']'));
    assert.equal(p.finish(),100000);assert.equal(count,100000);assert.ok(bytes>64*1024**2);
    process.stdout.write(JSON.stringify({bytes,count,rss:process.resourceUsage().maxRSS}));`;
  const child = spawnSync(
    process.execPath,
    ["--max-old-space-size=32", "-e", code],
    { encoding: "utf8", timeout: 30000, maxBuffer: 4096 },
  );
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const evidence = JSON.parse(child.stdout);
  assert.equal(evidence.count, 100000);
  assert.ok(evidence.bytes > 64 * 1024 ** 2);
});
