const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { createHash, randomBytes } = require("node:crypto");
const zipFixture = require("./zip-fixture.cjs");
const { createMigrationRuntime } = require("../dist/backend.cjs");
async function setup(t, entries) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "home-zip-test-"));
  const source = path.join(dir, "export.zip");
  const destination = path.join(dir, "copies");
  const zip = zipFixture(entries);
  await fs.writeFile(source, zip);
  await fs.mkdir(destination);
  let runtime = await createMigrationRuntime(path.join(dir, "profile"));
  t.after(async () => {
    await runtime.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const job = await runtime.request("create", { provider: "Dropbox" });
  await runtime.request("source", { id: job.id, path: source });
  await runtime.request("destination", { id: job.id, path: destination });
  async function settle() {
    for (let i = 0; i < 1000; i++) {
      const j = (await runtime.request("list"))[0];
      if (!["running", "inspecting"].includes(j.state)) {
        await new Promise((r) => setTimeout(r, 60));
        return j;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("ZIP job did not finish");
  }
  return {
    dir,
    source,
    destination,
    zip,
    job,
    settle,
    request: (command) => runtime.request(command, { id: job.id }),
    restart: async () => {
      await runtime.close();
      runtime = await createMigrationRuntime(path.join(dir, "profile"));
    },
  };
}
test("ZIP preserves the source archive and verifies extracted bytes across restart", async (t) => {
  const f = await setup(t, [
    { name: "photos/", mode: 0o40755 },
    { name: "photos/memory.txt", data: "A memory.", deflate: true },
  ]);
  await f.request("inspect");
  const preview = await f.settle();
  assert.equal(preview.state, "ready", preview.error);
  assert.equal(preview.inspection.files, 1);
  await f.request("start");
  const done = await f.settle();
  assert.equal(done.state, "verified", done.error);
  assert.deepEqual(
    await fs.readFile(path.join(done.output, "original/export.zip")),
    f.zip,
  );
  assert.equal(
    await fs.readFile(
      path.join(done.output, "files/photos/memory.txt"),
      "utf8",
    ),
    "A memory.",
  );
  const report = JSON.parse(
    await fs.readFile(path.join(done.output, "report.json"), "utf8"),
  );
  assert.equal(
    report.originalArchive.sha256,
    createHash("sha256").update(f.zip).digest("hex"),
  );
  assert.equal(report.interpreted, false);
  await f.restart();
  await f.request("start");
  assert.equal((await f.settle()).state, "verified");
  await fs.writeFile(
    path.join(done.output, "files/photos/memory.txt"),
    "changed",
  );
  await f.request("start");
  const broken = await f.settle();
  assert.equal(broken.state, "failed");
  assert.match(broken.error, /conflict|corruption/);
});

for (const [name, entries, pattern] of [
  [
    "traversal",
    [{ name: "../escape.txt", data: "escape" }],
    /invalid|filename/i,
  ],
  ["symlink", [{ name: "link", data: "/etc/hosts", mode: 0o120777 }], /links/i],
  [
    "case collision",
    [
      { name: "A.txt", data: "a" },
      { name: "a.txt", data: "b" },
    ],
    /colliding/i,
  ],
  [
    "parent spelling collision",
    [
      { name: "Photos/a", data: "a" },
      { name: "photos/b", data: "b" },
    ],
    /colliding/i,
  ],
  [
    "file directory collision",
    [
      { name: "photos/a", data: "a" },
      { name: "photos", data: "b" },
    ],
    /collision/i,
  ],
  [
    "encryption",
    [{ name: "secret.txt", data: "secret", flags: 0x801 }],
    /encrypted/i,
  ],
  [
    "expansion bomb",
    [{ name: "huge.bin", data: Buffer.alloc(1024 * 1024), deflate: true }],
    /expansion/i,
  ],
])
  test(`ZIP review rejects ${name} without extraction`, async (t) => {
    const f = await setup(t, entries);
    await f.request("inspect");
    const job = await f.settle();
    assert.equal(job.state, "failed");
    assert.match(job.error, pattern);
    assert.deepEqual(await fs.readdir(f.destination), []);
  });

test("ZIP CRC failure never becomes a verified extracted file", async (t) => {
  const f = await setup(t, [
    { name: "damaged.txt", data: "looks readable", badCrc: true },
  ]);
  await f.request("inspect");
  assert.equal((await f.settle()).state, "ready");
  await f.request("start");
  const done = await f.settle();
  assert.equal(done.state, "failed");
  assert.match(done.error, /checksum/);
  await assert.rejects(fs.stat(path.join(done.output, "files/damaged.txt")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.stat(path.join(done.output, "report.json")), {
    code: "ENOENT",
  });
});
test("ZIP source changes invalidate review; pause/restart resumes without duplicate files", async (t) => {
  const entries = Array.from({ length: 24 }, (_, i) => ({
    name: `${i}.bin`,
    data: randomBytes(128 * 1024),
    deflate: true,
  }));
  const f = await setup(t, entries);
  await f.request("inspect");
  assert.equal((await f.settle()).state, "ready");
  await f.request("start");
  await f.request("pause");
  assert.equal((await f.settle()).state, "paused");
  await f.restart();
  await f.request("start");
  const done = await f.settle();
  assert.equal(done.state, "verified", done.error);
  assert.equal((await fs.readdir(path.join(done.output, "files"))).length, 24);
  await fs.writeFile(
    f.source,
    zipFixture([{ name: "other.txt", data: "new export" }]),
  );
  await f.request("start");
  const changed = await f.settle();
  assert.equal(changed.state, "failed");
  assert.match(changed.error, /source changed/);
});
