const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { gzipSync } = require("node:zlib");
const { pack } = require("../node_modules/tar-stream");
const { createMigrationRuntime } = require("../dist/backend.cjs");
async function archive(items) {
  const writer = pack();
  for (const { data = "", ...header } of items)
    writer.entry({ mtime: new Date("2020-01-01T00:00:00Z"), ...header }, data);
  writer.finalize();
  const chunks = [];
  for await (const chunk of writer) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function setup(t, bytes, compressed = false) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "home-tar-test-"));
  const source = path.join(dir, compressed ? "export.tar.gz" : "export.tar");
  const destination = path.join(dir, "copies");
  const original = compressed ? gzipSync(bytes) : bytes;
  await fs.writeFile(source, original);
  await fs.mkdir(destination);
  let runtime = await createMigrationRuntime(path.join(dir, "profile"));
  t.after(async () => {
    await runtime.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const job = await runtime.request("create", { provider: "Dropbox" });
  await runtime.request("source", { id: job.id, path: source });
  await runtime.request("destination", { id: job.id, path: destination });
  return {
    dir,
    source,
    destination,
    original,
    request: (command) => runtime.request(command, { id: job.id }),
    restart: async () => {
      await runtime.close();
      runtime = await createMigrationRuntime(path.join(dir, "profile"));
    },
    settle: async () => {
      for (let i = 0; i < 500; i++) {
        const result = (await runtime.request("list"))[0];
        if (!["running", "inspecting"].includes(result.state)) {
          await new Promise((r) => setTimeout(r, 60));
          return result;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("TAR did not settle");
    },
  };
}
for (const compressed of [false, true])
  test(`TAR${compressed ? ".GZ" : ""} preserves the archive, files and re-verifies after restart`, async (t) => {
    const f = await setup(
      t,
      await archive([
        { name: "./", type: "directory" },
        { name: "./notes/memory.txt", data: "Preserve this memory." },
      ]),
      compressed,
    );
    await f.request("inspect");
    assert.equal((await f.settle()).state, "ready");
    await f.request("start");
    const done = await f.settle();
    assert.equal(done.state, "verified", done.error);
    assert.equal(
      await fs.readFile(
        path.join(done.output, "files/notes/memory.txt"),
        "utf8",
      ),
      "Preserve this memory.",
    );
    assert.deepEqual(
      await fs.readFile(
        path.join(done.output, "original", path.basename(f.source)),
      ),
      f.original,
    );
    await f.restart();
    await f.request("start");
    assert.equal((await f.settle()).state, "verified");
  });
for (const [name, items, pattern] of [
  ["traversal", [{ name: "../outside", data: "no" }], /filename/i],
  [
    "symlink",
    [{ name: "linked", type: "symlink", linkname: "/etc/hosts" }],
    /links/i,
  ],
  [
    "hardlink",
    [{ name: "linked", type: "link", linkname: "/etc/hosts" }],
    /links/i,
  ],
  [
    "duplicate",
    [
      { name: "A", data: "a" },
      { name: "a", data: "b" },
    ],
    /colliding/i,
  ],
  [
    "file directory collision",
    [
      { name: "notes", data: "a" },
      { name: "notes/b", data: "b" },
    ],
    /collision/i,
  ],
])
  test(`TAR refuses ${name} before output`, async (t) => {
    const f = await setup(t, await archive(items));
    await f.request("inspect");
    const done = await f.settle();
    assert.equal(done.state, "failed");
    assert.match(done.error, pattern);
    assert.deepEqual(await fs.readdir(f.destination), []);
  });
test("truncated TAR is rejected during review", async (t) => {
  const bytes = await archive([
    { name: "memory.txt", data: "A complete memory is required." },
  ]);
  const f = await setup(t, bytes.subarray(0, 520));
  await f.request("inspect");
  assert.equal((await f.settle()).state, "failed");
  assert.deepEqual(await fs.readdir(f.destination), []);
});
