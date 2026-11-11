const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const exec = promisify(require("node:child_process").execFile);
const { createHash } = require("node:crypto");
const { PhotosBridge } = require("../dist/photos-bridge.cjs");
const {
  photosAdapter,
  createMigrationRuntime,
} = require("../dist/backend.cjs");
const mac = process.platform === "darwin";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let root, binary;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-photos-jobs-"));
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
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(root, "job-"));
  const profile = path.join(dir, "profile");
  let bridge,
    runtime,
    failure = "",
    changed = false;
  const keys = [];
  const options = {
    cloud: {
      photosFactory: async (signal) => {
        bridge = new PhotosBridge(binary);
        const read = bridge.read.bind(bridge);
        bridge.read = (...args) => {
          keys.push(args[0]);
          return read(...args);
        };
        await bridge.request("fixtureSet", {
          permission: "authorized",
          failure,
          changed,
        });
        return photosAdapter(
          bridge,
          { namespace: "fixture-library", networkAllowed: false },
          signal,
        );
      },
    },
  };
  const launch = async () => {
    runtime = await createMigrationRuntime(profile, options);
  };
  await launch();
  const call = (...args) => runtime.request(...args);
  t.after(async () => {
    await runtime.close();
  });
  async function connect() {
    const c = await call("cloudConnect", { provider: "iCloud Photos" });
    const page = await call("cloudBrowse", { connection: c.id });
    return { c, page };
  }
  async function prepare(c, selected) {
    const j = await call("cloudCreate", { connection: c.id, selected });
    await call("cloudDestination", { id: j.id, path: dir });
    return j;
  }
  async function settle(id) {
    for (let n = 0; n < 1000; n++) {
      const j = (await call("cloudJobs")).find((j) => j.id === id);
      if (!["downloading", "discovering", "scanning"].includes(j.state))
        return j;
      await sleep(10);
    }
    throw Error("job timeout");
  }
  return {
    dir,
    profile,
    keys,
    call,
    connect,
    prepare,
    settle,
    get bridge() {
      return bridge;
    },
    set failure(v) {
      failure = v;
    },
    set changed(v) {
      changed = v;
    },
    async restart() {
      await runtime.close();
      await launch();
    },
  };
}
test("Photos remains unavailable without trusted host injection", async (t) => {
  const dir = await fs.mkdtemp(path.join(root, "disabled-"));
  const runtime = await createMigrationRuntime(dir);
  t.after(() => runtime.close());
  await assert.rejects(
    runtime.request("cloudConnect", {
      provider: "iCloud Photos",
      photosFactory: true,
      networkAllowed: true,
    }),
    /supported service/,
  );
});
test(
  "selected unknown-length resources use shared SQLite jobs, distinct paths and verified receipts",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    const { c, page } = await f.connect();
    assert.equal(page.entries[0].size, undefined);
    assert.notEqual(page.entries[0].id, page.entries[1].id);
    const j = await f.prepare(
      c,
      page.entries.slice(0, 2).map((e) => e.id),
    );
    const local = path.join(f.dir, "local");
    await fs.mkdir(local);
    await f.call("cloudScanDirectory", {
      id: j.id,
      connection: c.id,
      path: local,
    });
    const planned = await f.settle(j.id);
    assert.equal(planned.unknownFiles, 2);
    assert.equal(planned.knownBytes, 0);
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "downloaded", done.error);
    assert.equal(done.files, 2);
    assert.equal(done.unknownFiles, 0);
    assert.equal(done.knownBytes, done.bytes);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(done.folder, "migration-manifest.json"),
        "utf8",
      ),
    );
    assert.deepEqual(
      manifest.files.map((x) => x.metadata.role),
      ["originalPhoto", "originalPairedVideo"],
    );
    assert.equal(
      manifest.files[0].metadata.originalFilename,
      manifest.files[1].metadata.originalFilename,
    );
    for (const item of manifest.files) {
      assert.equal(item.size, undefined);
      assert.equal(item.reusePolicy, "checksum-only");
      const bytes = await fs.readFile(
        path.join(done.folder, "files", item.path),
      );
      assert.equal(bytes.length, item.completed.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        item.completed.sha256,
      );
      assert.equal(item.metadata.key, undefined);
    }
    const db = await fs.readFile(path.join(f.profile, "migration.db"));
    const Database = require("../node_modules/better-sqlite3");
    const catalog = new Database(path.join(f.profile, "migration.db"), {
      readonly: true,
    });
    try {
      const rows = catalog
        .prepare(
          "SELECT path, bytes, sha256, source_key, revision FROM migrate_fingerprints",
        )
        .all();
      assert.equal(rows.length, 2);
      for (const item of manifest.files) {
        const row = rows.find(
          (r) => r.path === path.join(done.folder, "files", item.path),
        );
        assert.ok(row);
        assert.equal(row.bytes, item.completed.bytes);
        assert.equal(row.sha256, item.completed.sha256);
        assert.equal(row.revision, item.revision);
        assert.deepEqual(JSON.parse(row.source_key), [
          "iCloud Photos",
          "photokit:fixture-library",
          item.id,
        ]);
      }
    } finally {
      catalog.close();
    }
    assert.equal(f.keys.length, 2);
    for (const key of f.keys) {
      assert(!db.includes(Buffer.from(key)));
      assert(!JSON.stringify(manifest).includes(key));
    }
    await f.restart();
    assert.equal((await f.call("cloudJobs"))[0].bytes, done.bytes);
  },
);
test(
  "partial resource never publishes; reconnect rediscovers saved selection and retains completed copies",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    f.failure = "partialPaired";
    let { c, page } = await f.connect();
    const j = await f.prepare(
      c,
      page.entries.slice(0, 2).map((e) => e.id),
    );
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const failed = await f.settle(j.id);
    assert.equal(failed.state, "failed");
    assert.equal(failed.files, 1);
    assert(
      !(await fs.readdir(failed.folder)).some((n) => n.endsWith(".partial")),
    );
    await assert.rejects(
      fs.stat(path.join(failed.folder, "migration-manifest.json")),
      { code: "ENOENT" },
    );
    f.failure = "";
    await f.restart();
    ({ c, page } = await f.connect());
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "downloaded", done.error);
    assert.equal(done.files, 2);
    assert.equal(done.reusedFiles, 0);
    assert.equal(f.keys.length, 3);
    assert.notEqual(f.keys[1], f.keys[2]);
  },
);
test(
  "pause aborts an in-flight resource and restart uses new native handles",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    f.failure = "stallPaired";
    let { c, page } = await f.connect();
    const j = await f.prepare(
      c,
      page.entries.slice(0, 2).map((e) => e.id),
    );
    await f.call("cloudStart", { id: j.id, connection: c.id });
    let observed;
    for (let n = 0; n < 500; n++) {
      observed = (await f.call("cloudJobs")).find((x) => x.id === j.id);
      if (observed.files === 1) break;
      await sleep(10);
    }
    assert.equal(observed.files, 1);
    await f.call("cloudPause", { id: j.id });
    assert.equal((await f.settle(j.id)).state, "paused");
    f.failure = "";
    await f.restart();
    ({ c } = await f.connect());
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "downloaded", done.error);
  },
);
test(
  "changed selected assets after restart cannot replace saved versions",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    f.failure = "partialPaired";
    let { c, page } = await f.connect();
    const j = await f.prepare(
      c,
      page.entries.slice(0, 2).map((e) => e.id),
    );
    await f.call("cloudStart", { id: j.id, connection: c.id });
    await f.settle(j.id);
    f.failure = "";
    f.changed = true;
    await f.restart();
    ({ c } = await f.connect());
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const failed = await f.settle(j.id);
    assert.equal(failed.state, "failed");
    assert.match(failed.error, /changed|accessible/);
    assert.equal(failed.files, 1);
  },
);
test(
  "metadata revisions never allow cross-job Photos reuse, even from a fingerprinted local copy",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    const { c, page } = await f.connect();
    const first = await f.prepare(c, [page.entries[0].id]);
    await f.call("cloudStart", { id: first.id, connection: c.id });
    const done = await f.settle(first.id);
    assert.equal(done.state, "downloaded");
    const next = await f.prepare(c, [page.entries[0].id]);
    await f.call("cloudScanDirectory", {
      id: next.id,
      connection: c.id,
      path: path.join(done.folder, "files"),
    });
    const compared = await f.settle(next.id);
    assert.equal(compared.comparison.matching, 0);
    assert.equal(compared.comparison.uncertain, 1);
    await f.bridge.request("fixtureSet", { failure: "partial" });
    await f.call("cloudStart", { id: next.id, connection: c.id });
    const failed = await f.settle(next.id);
    assert.equal(failed.state, "failed");
    assert.equal(failed.reusedFiles, 0);
  },
);
test(
  "changed native revision after all chunks still prevents disk publication",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    f.failure = "changedAfter";
    const { c, page } = await f.connect();
    const j = await f.prepare(c, [page.entries[0].id]);
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const failed = await f.settle(j.id);
    assert.equal(failed.state, "failed");
    assert.equal(failed.files, 0);
    assert(
      !(await fs.readdir(failed.folder)).some((n) => n.endsWith(".partial")),
    );
    await assert.rejects(
      fs.stat(path.join(failed.folder, "migration-manifest.json")),
      { code: "ENOENT" },
    );
  },
);

test(
  "saved later-page selection is rediscovered after restart without expanding its scope",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    let { c, page } = await f.connect();
    const last = await f.call("cloudBrowse", {
      connection: c.id,
      cursor: page.cursor,
    });
    const selected = last.entries.at(-1);
    const j = await f.prepare(c, [selected.id]);
    await f.restart();
    ({ c } = await f.connect());
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "downloaded", done.error);
    assert.equal(done.files, 1);
    const receipt = JSON.parse(
      await fs.readFile(path.join(done.folder, "migration-manifest.json")),
    );
    assert.equal(receipt.files[0].id, selected.id);
    assert.equal(receipt.files[0].metadata.assetId, "fixture-22");
  },
);
test(
  "changed completed file is retained and refused during Photos recovery",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    f.failure = "partialPaired";
    let { c, page } = await f.connect();
    const j = await f.prepare(
      c,
      page.entries.slice(0, 2).map((e) => e.id),
    );
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const failed = await f.settle(j.id);
    const files = await fs.readdir(path.join(failed.folder, "files"), {
      recursive: true,
    });
    const file = files.find((n) => n.endsWith("-originalPhoto.dat"));
    assert.ok(file);
    const target = path.join(failed.folder, "files", file);
    await fs.writeFile(target, "user-modified");
    f.failure = "";
    await f.restart();
    ({ c } = await f.connect());
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const refused = await f.settle(j.id);
    assert.equal(refused.state, "failed");
    assert.match(refused.error, /completed local file changed/);
    assert.equal(await fs.readFile(target, "utf8"), "user-modified");
  },
);
test(
  "unknown-length Photos transfer checks free space while growing and removes provisional bytes",
  { skip: !mac },
  async (t) => {
    const f = await fixture(t);
    const { c, page } = await f.connect();
    const j = await f.prepare(c, [page.entries[0].id]);
    let calls = 0;
    const stub = t.mock.method(fs, "statfs", async () => ({
      bsize: 1,
      bavail: ++calls === 1 ? 1024 ** 3 : 0,
    }));
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const failed = await f.settle(j.id);
    stub.mock.restore();
    assert.equal(failed.state, "failed");
    assert.match(failed.error, /Free space/);
    assert.equal(failed.files, 0);
    assert(
      !(await fs.readdir(failed.folder)).some((n) => n.endsWith(".partial")),
    );
  },
);
test("Photos metadata validation rejects ambiguous descriptors, reused keys and empty advancing pages", async () => {
  for (const mode of ["duplicate", "key", "empty", "role"]) {
    const resource = {
      type: 1,
      role: "originalPhoto",
      filename: "photo.jpg",
      uti: "public.jpeg",
      key: "a",
    };
    const items =
      mode === "empty"
        ? []
        : [{ asset: "asset", revision: "a".repeat(64), resources: [resource] }];
    if (mode === "duplicate")
      items[0].resources.push({ ...resource, key: "b" });
    if (mode === "key")
      items[0].resources.push({
        ...resource,
        type: 9,
        role: "originalPairedVideo",
      });
    if (mode === "role") resource.role = "currentPhoto";
    const bridge = {
      request: async (command) =>
        command === "hello"
          ? { protocol: 1, authorizationRequests: false }
          : command === "status"
            ? { authorization: "authorized" }
            : {
                authorization: "authorized",
                assets: items,
                cursor: mode === "empty" ? "next" : null,
              },
      close: async () => {},
    };
    const adapter = await photosAdapter(
      bridge,
      { namespace: "test", networkAllowed: false },
      new AbortController().signal,
    );
    await assert.rejects(
      adapter.browse("", undefined, new AbortController().signal),
      /invalid or ambiguous/,
    );
    await adapter.close();
  }
});
