const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const exec = promisify(require("node:child_process").execFile);
const { PhotosBridge } = require("../dist/photos-bridge.cjs");
const mac = process.platform === "darwin";
let root, binary;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-photos-bridge-"));
  binary = path.join(root, "fixture");
  if (mac)
    await exec("xcrun", [
      "swiftc",
      "-swift-version",
      "5",
      "-D",
      "PHOTOKIT_FIXTURE",
      "-framework",
      "Photos",
      "-target",
      `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`,
      "-O",
      path.resolve(__dirname, "../native/photos/main.swift"),
      "-o",
      binary,
    ]);
});
after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
function fixture(t, options) {
  const bridge = new PhotosBridge(binary, options);
  t.after(() => bridge.close());
  return bridge;
}
async function selection(bridge, permission = "authorized") {
  await bridge.request("fixtureSet", { permission });
  return bridge.request("open");
}
async function collect(bridge, key, network = false, signal) {
  const chunks = [];
  for await (const chunk of bridge.read(key, network, signal))
    chunks.push(chunk);
  return Buffer.concat(chunks);
}
const code = (value) => (error) => error.code === value;
test(
  "production hello is inert and rejects fixture and authorization operations",
  { skip: !mac },
  async (t) => {
    const bridge = new PhotosBridge(
      path.resolve(
        __dirname,
        "../../../apps/migration/runtime-dist/photos-helper",
      ),
    );
    t.after(() => bridge.close());
    const hello = await bridge.request("hello");
    assert.equal(hello.fixture, false);
    assert.equal(hello.authorizationRequests, false);
    assert.equal(hello.protocol, 1);
    for (const command of ["fixtureSet", "authorize"])
      await assert.rejects(bridge.request(command), code("unknown_command"));
  },
);
test(
  "fixture permissions gate discovery without requesting access",
  { skip: !mac },
  async (t) => {
    const bridge = fixture(t);
    assert.equal(
      (await bridge.request("status")).authorization,
      "notDetermined",
    );
    for (const permission of [
      "notDetermined",
      "denied",
      "restricted",
      "unknown",
    ]) {
      await bridge.request("fixtureSet", { permission });
      await assert.rejects(bridge.request("open"), code("permission_required"));
    }
    assert.equal((await selection(bridge, "limited")).authorization, "limited");
  },
);
test(
  "bounded pages distinguish resource roles and invalidate old handles",
  { skip: !mac },
  async (t) => {
    const bridge = fixture(t);
    const first = await selection(bridge);
    assert.equal(first.assets.length, 20);
    assert.deepEqual(
      first.assets.slice(0, 3).map((a) => a.resources.map((r) => r.role)),
      [
        ["originalPhoto", "originalPairedVideo"],
        ["originalPhoto", "alternatePhoto"],
        ["originalPhoto", "currentPhoto", "adjustmentData"],
      ],
    );
    const resources = first.assets.flatMap((a) => a.resources);
    assert.equal(new Set(resources.map((r) => r.key)).size, resources.length);
    assert.equal(new Set(resources.map((r) => r.filename)).size, 1);
    assert.ok(resources.every((r) => r.size === undefined));
    const last = await bridge.request("page", { cursor: first.cursor });
    assert.equal(last.assets.length, 3);
    assert.equal(last.cursor, null);
    await bridge.request("open");
    await assert.rejects(
      bridge.request("page", { cursor: first.cursor }),
      code("invalid_cursor"),
    );
    await assert.rejects(
      collect(bridge, resources[0].key),
      code("invalid_selection"),
    );
  },
);
test(
  "selected streams retain paired bytes and require explicit network access",
  { skip: !mac },
  async (t) => {
    const bridge = fixture(t);
    const first = await selection(bridge);
    const key = first.assets[0].resources[1].key;
    await bridge.request("fixtureSet", { failure: "needsNetwork" });
    await assert.rejects(collect(bridge, key), code("network_required"));
    assert.deepEqual(
      await collect(bridge, key, true),
      Buffer.concat([Buffer.from("fixture-role-9:"), Buffer.alloc(150000, 42)]),
    );
  },
);
for (const failure of ["partial", "changedAfter", "changedBefore"])
  test(`stream cannot succeed after ${failure}`, { skip: !mac }, async (t) => {
    const bridge = fixture(t);
    const first = await selection(bridge);
    await bridge.request("fixtureSet", {
      failure,
      changed: failure === "changedBefore",
    });
    let received = 0;
    await assert.rejects(
      async () => {
        for await (const chunk of bridge.read(
          first.assets[0].resources[0].key,
          false,
        ))
          received += chunk.length;
      },
      code(failure === "partial" ? "resource_failed" : "asset_changed"),
    );
    assert.equal(received > 0, failure !== "changedBefore");
  });
test(
  "resource byte limit and abandoned iterator close the session",
  { skip: !mac },
  async (t) => {
    for (const maxBytes of [10, 1000000]) {
      const bridge = fixture(t, { maxBytes });
      const first = await selection(bridge);
      if (maxBytes === 10)
        await assert.rejects(
          collect(bridge, first.assets[0].resources[0].key),
          code("resource_too_large"),
        );
      else
        for await (const chunk of bridge.read(
          first.assets[0].resources[0].key,
          false,
        )) {
          assert.ok(chunk.length);
          break;
        }
      await assert.rejects(bridge.request("hello"), code("session_closed"));
    }
  },
);
for (const mode of ["cancelled", "idle_timeout", "deadline_exceeded"])
  test(`stalled transfer is bounded by ${mode}`, { skip: !mac }, async (t) => {
    const bridge = fixture(t, {
      idleMs: mode === "idle_timeout" ? 500 : 10000,
      deadlineMs: mode === "deadline_exceeded" ? 500 : 20000,
    });
    const first = await selection(bridge);
    await bridge.request("fixtureSet", { failure: "stall" });
    const controller = new AbortController();
    const pending = collect(
      bridge,
      first.assets[0].resources[0].key,
      false,
      controller.signal,
    );
    await assert.rejects(bridge.request("hello"), code("session_busy"));
    if (mode === "cancelled") controller.abort();
    await assert.rejects(pending, code(mode));
  });
for (const [name, response, expected] of [
  ["wrong id", '({id:q.id+1,kind:"result",value:{}})', "unexpected_response"],
  ["bad base64", '({id:q.id,kind:"chunk",data:"???"})', "invalid_chunk"],
  [
    "wrong hash",
    '({id:q.id,kind:"result",value:{bytes:0,sha256:"wrong"}})',
    "stream_integrity_failed",
  ],
  ["oversized frame", '"x".repeat(600000)', "oversized_frame"],
  ["EOF", "null", "incomplete_response"],
])
  test(`transport rejects ${name}`, async (t) => {
    const fake = path.join(root, name.replaceAll(" ", "-") + ".cjs");
    await fs.writeFile(
      fake,
      `#!${process.execPath}\nrequire('node:readline').createInterface({input:process.stdin}).once('line', line => { const q=JSON.parse(line); const result=${response}; if(result===null) process.exit(0); else process.stdout.write(JSON.stringify(result)+'\\n'); });`,
    );
    await fs.chmod(fake, 0o700);
    const bridge = new PhotosBridge(fake);
    t.after(() => bridge.close());
    await assert.rejects(collect(bridge, "test"), code(expected));
  });
test("invalid limits, missing helper and oversized request fail closed", async (t) => {
  assert.throws(
    () => new PhotosBridge("relative"),
    code("invalid_helper_path"),
  );
  assert.throws(
    () => new PhotosBridge("/missing", { maxBytes: Infinity }),
    code("invalid_limits"),
  );
  const bridge = new PhotosBridge(path.join(root, "missing"));
  t.after(() => bridge.close());
  await assert.rejects(bridge.request("hello"), code("helper_unavailable"));
  if (mac) {
    const valid = fixture(t);
    await assert.rejects(
      valid.request("page", { cursor: "x".repeat(70000) }),
      code("oversized_request"),
    );
    assert.equal((await valid.request("hello")).fixture, true);
  }
});
