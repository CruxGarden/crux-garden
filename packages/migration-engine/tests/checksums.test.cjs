const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { Readable } = require("node:stream");
const { createHash } = require("node:crypto");
const { buildSync } = require("../../../node_modules/esbuild");
const { fixture } = require("./cloud-fixture.cjs");
function load(name) {
  const filename = path.resolve(__dirname, "../src", name + ".ts");
  const js = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["@cruxgarden/local-api"],
  }).outputFiles[0].text;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(js, filename);
  return mod.exports;
}
const { DropboxContentHash, contentHasher } = load("checksums");
const { openMigrationStore } = load("store");
const { fingerprint } = load("cloud/fingerprints");
// Fixed vectors generated independently with Python hashlib from repeated 'a' bytes.
const vectors = [
  [0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  [1, "bf5d3affb73efd2ec6c36ad3112dd933efed63c4e1cbffcfa88e2759c144f2d8"],
  [4194303, "49c0a79929eacf8ccbe77f99ff043ca55f97000c68bccefc644791170969a3b2"],
  [4194304, "907a506cf5e706bda5c7a29b43c9c65d8344bd2fa2f22339b359c214812af5a1"],
  [4194305, "5f858b62ccd88447586305aec6fd53c96747cfebf527cbba129a6dfed47d9624"],
  [8388721, "d33417c58e1a28062ce9ae32d98eb0fdc45ac9b08331717ca2cd2a945e750e59"],
];
test("Dropbox checksums match fixed empty, boundary and multi-block vectors regardless of transport chunks", () => {
  for (const [length, expected] of vectors) {
    const data = Buffer.alloc(length, 0x61);
    for (const step of [65537, 4194304, 5000000]) {
      const hash = new DropboxContentHash();
      hash.update(Buffer.alloc(0));
      for (let i = 0; i < data.length; i += step)
        hash.update(data.subarray(i, i + step));
      assert.equal(
        hash.digest("hex"),
        expected,
        `${length} bytes with ${step}-byte chunks`,
      );
      assert.throws(() => hash.update(data), /finalized/);
      assert.throws(() => hash.digest("hex"), /finalized/);
    }
  }
  assert.throws(() => contentHasher("sha1"), /Unsupported/);
});
test("existing SQLite fingerprint catalog gains Dropbox hashes without losing jobs, Mood or source identities", async (t) => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-hash-upgrade-")),
  );
  const {
    LocalGraphRuntime,
  } = require("../node_modules/@cruxgarden/local-api");
  let api = await LocalGraphRuntime.create(path.join(dir, "migration.db"));
  await api.run(
    "CREATE TABLE migrate_fingerprints (path TEXT PRIMARY KEY,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,md5 TEXT NOT NULL,checked_at TEXT NOT NULL,source_key TEXT,revision TEXT)",
  );
  const data = Buffer.from("a"),
    local = path.join(dir, "local.bin");
  await fs.writeFile(local, data);
  const sha = createHash("sha256").update(data).digest("hex");
  await api.run("INSERT INTO migrate_fingerprints VALUES(?,?,?,?,?,?,?)", [
    local,
    1,
    sha,
    "",
    new Date().toISOString(),
    "source-key",
    "version-1",
  ]);
  await api.putSetting("migration:mood", JSON.stringify({ accent: "#123456" }));
  await api.putSetting(
    "migration:job:existing",
    JSON.stringify({ id: "existing", state: "verified" }),
  );
  await api.close();
  let store = await openMigrationStore(dir);
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  assert.equal((await store.loadJobs())[0].id, "existing");
  assert.deepEqual(await store.getMood(), { accent: "#123456" });
  let existing = (await store.findFingerprints("source-key", "version-1"))[0];
  assert.equal(existing.sha256, sha);
  assert.equal(existing.dropbox, null);
  const checksum = { algorithm: "dropbox", hex: vectors[1][1] };
  assert.equal(
    (await store.findFingerprints("", undefined, checksum, 1)).length,
    0,
  );
  const actual = await fingerprint(local, new AbortController().signal);
  assert.equal(actual.dropbox, checksum.hex);
  await store.putFingerprint(actual);
  existing = (await store.findFingerprints("", undefined, checksum, 1))[0];
  assert.equal(existing.sourceKey, "source-key");
  assert.equal(existing.revision, "version-1");
  // A later SHA-only preservation must retain the additional hash for identical bytes.
  const { dropbox, ...shaOnly } = actual;
  await store.putFingerprint(shaOnly);
  await store.close();
  store = await openMigrationStore(dir);
  assert.equal(
    (await store.findFingerprints("", undefined, checksum, 1)).length,
    1,
  );
  await store.putFingerprint({ ...shaOnly, sha256: "f".repeat(64) });
  assert.equal(
    (await store.findFingerprints("", undefined, checksum, 1)).length,
    0,
    "changed content must clear stale provider hashes",
  );
  assert.equal(
    (await store.findFingerprints("source-key", "version-1")).length,
    0,
  );
});
async function hashedFixture(t, { bad = false } = {}) {
  const bytes = Buffer.alloc(4194305, 0x61);
  let reads = 0;
  const expected = vectors[4][1];
  const f = await fixture(t, {
    adapterFactory: async () => ({
      // Test-only adapter exercises the shared checksum contract, not Dropbox OAuth/API.
      provider: "Amazon S3",
      identity: "checksum-fixture",
      label: "Checksum fixture",
      notes: [],
      async browse() {
        return {
          entries: [
            { id: "one", name: "one.bin", kind: "file", size: bytes.length },
            { id: "two", name: "two.bin", kind: "file", size: bytes.length },
          ],
        };
      },
      async *discover(selection) {
        for (const entry of selection)
          yield {
            id: entry.id,
            path: entry.name,
            revision: "v1",
            size: bytes.length,
            checksum: {
              algorithm: "dropbox",
              hex: bad ? "0".repeat(64) : expected,
            },
          };
      },
      async read() {
        reads++;
        return {
          size: bytes.length,
          body: Readable.from(
            (function* () {
              for (let i = 0; i < bytes.length; i += 71111)
                yield bytes.subarray(i, i + 71111);
            })(),
          ),
        };
      },
    }),
  });
  return {
    ...f,
    bytes,
    get reads() {
      return reads;
    },
  };
}
test("shared transfers verify Dropbox block hashes, reuse identical bytes and retain independent copies after restart", async (t) => {
  const f = await hashedFixture(t);
  let c = await f.connect();
  let j = await f.prepare(c.id, ["one", "two"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  let done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(f.reads, 1);
  assert.equal(done.reusedFiles, 1);
  const a = path.join(done.folder, "files/one.bin"),
    b = path.join(done.folder, "files/two.bin");
  assert.deepEqual(await fs.readFile(a), f.bytes);
  assert.notEqual((await fs.stat(a)).ino, (await fs.stat(b)).ino);
  await f.restart();
  c = await f.connect();
  j = await f.prepare(c.id, ["one"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 1);
  assert.equal(f.reads, 1);
});
test("local comparison matches a renamed file by Dropbox checksum and rechecks changed local bytes before reuse", async (t) => {
  const f = await hashedFixture(t);
  const c = await f.connect();
  const j = await f.prepare(c.id, ["one"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  const file = path.join(local, "renamed.bin");
  await fs.writeFile(file, f.bytes);
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  const compared = await f.settle(j.id);
  assert.equal(compared.comparison.matching, 1);
  assert.equal(f.reads, 0);
  await fs.writeFile(file, Buffer.alloc(f.bytes.length, 0x62));
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 0);
  assert.equal(f.reads, 1);
});
test("wrong provider block checksum never publishes or marks a transfer complete", async (t) => {
  const f = await hashedFixture(t, { bad: true });
  const c = await f.connect();
  const j = await f.prepare(c.id, ["one"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /checksum did not match/);
  assert.equal(done.files, 0);
  assert.deepEqual(await fs.readdir(path.join(done.folder, "files")), []);
  assert(
    !(await fs.readdir(done.folder)).some((name) => name.endsWith(".partial")),
  );
});
