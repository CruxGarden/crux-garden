const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Readable } = require("node:stream");
const { createMigrationRuntime } = require("../dist/backend.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-photo-host-"));
  const grants = [];
  let runtime;
  let closed = 0;
  const options = {
    cloud: {
      photosFactory: async (signal, grant) => {
        signal.throwIfAborted();
        grants.push({ ...grant });
        return {
          provider: "iCloud Photos",
          identity: `photokit:${grant.namespace}`,
          label: "Fixture Photos",
          notes: [],
          browse: async () => ({
            entries: [
              {
                id: "resource",
                kind: "file",
                name: "Original",
                revision: "v1",
              },
            ],
          }),
          async *discover() {
            yield {
              id: "resource",
              path: "original.dat",
              revision: "v1",
              reusePolicy: "checksum-only",
            };
          },
          read: async () => ({ body: Readable.from([Buffer.from("photo")]) }),
          close: async () => {
            closed++;
          },
        };
      },
    },
  };
  const launch = async () => {
    runtime = await createMigrationRuntime(dir, options);
  };
  await launch();
  t.after(async () => {
    await runtime.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    grants,
    get closed() {
      return closed;
    },
    call: (...args) => runtime.request(...args),
    connect: (...args) => runtime.connectPhotos(...args),
    async restart() {
      await runtime.close();
      await launch();
    },
  };
}
test("client requests cannot invoke the Photos host boundary even when an adapter is installed", async (t) => {
  const f = await fixture(t);
  for (const command of ["cloudConnect", "cloudAuthorize", "connectPhotos"])
    await assert.rejects(
      f.call(command, {
        provider: "iCloud Photos",
        sourceBinding: "private-source-binding",
        namespace: "forged",
        networkAllowed: true,
        photosFactory: true,
      }),
      /supported service|native host action/,
    );
  assert.equal(f.grants.length, 0);
  const c = await f.connect({
    sourceBinding: "private-source-binding",
    networkAllowed: false,
  });
  assert.equal(c.state, "connected");
  assert.equal(f.grants[0].networkAllowed, false);
  for (const networkAllowed of [undefined, "true", 1, null])
    await assert.rejects(
      f.connect({ sourceBinding: "private-source-binding", networkAllowed }),
      /Choose whether/,
    );
  for (const sourceBinding of [
    "",
    undefined,
    "/private/library",
    "x".repeat(129),
  ])
    await assert.rejects(
      f.connect({ sourceBinding, networkAllowed: false }),
      /source binding/,
    );
  assert.equal(f.grants.length, 1);
});
test("source namespaces persist through the sole SQLite owner; network choice is per connection", async (t) => {
  const f = await fixture(t);
  await f.connect({
    sourceBinding: "private-source-binding",
    networkAllowed: false,
  });
  const namespace = f.grants[0].namespace;
  assert.match(namespace, /^[a-f0-9-]{36}$/);
  await f.restart();
  await f.connect({
    sourceBinding: "private-source-binding",
    networkAllowed: true,
  });
  assert.equal(f.grants[1].namespace, namespace);
  assert.equal(f.grants[1].networkAllowed, true);
  await f.connect({
    sourceBinding: "another-source-binding",
    networkAllowed: false,
  });
  assert.notEqual(f.grants[2].namespace, namespace);
  const bytes = await fs.readFile(path.join(f.dir, "migration.db"));
  assert(!bytes.includes(Buffer.from("private-source-binding")));
});
test("serialized host actions resolve one namespace and new source bindings cannot resume old jobs", async (t) => {
  const f = await fixture(t);
  const [a, b] = await Promise.all([
    f.connect({ sourceBinding: "same", networkAllowed: false }),
    f.connect({ sourceBinding: "same", networkAllowed: true }),
  ]);
  assert.equal(f.grants[0].namespace, f.grants[1].namespace);
  assert.notEqual(a.id, b.id);
  await f.call("cloudBrowse", { connection: a.id });
  const j = await f.call("cloudCreate", {
    connection: a.id,
    selected: ["resource"],
  });
  await f.call("cloudDestination", { id: j.id, path: f.dir });
  const other = await f.connect({
    sourceBinding: "different",
    networkAllowed: false,
  });
  await assert.rejects(
    f.call("cloudStart", { id: j.id, connection: other.id }),
    /same source account/,
  );
});
test("invalid stored binding maps fail without resetting data or invoking a native factory", async () => {
  for (const bindings of [
    null,
    [],
    { bad: "not-a-uuid" },
    Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => [
        i.toString(16).padStart(64, "0"),
        "11111111-1111-4111-8111-111111111111",
      ]),
    ),
  ]) {
    let called = 0,
      saved = 0;
    const runtime = await createMigrationRuntime("/unused", {
      store: {
        loadJobs: async () => [],
        getMood: async () => ({}),
        cruxCount: async () => 0,
        loadCloudJobs: async () => [],
        saveCloudJob: async () => {},
        loadPhotoBindings: async () => bindings,
        savePhotoBindings: async () => {
          saved++;
        },
        close: async () => {},
      },
      cloud: {
        photosFactory: async () => {
          called++;
          throw Error("must not run");
        },
      },
    });
    try {
      await assert.rejects(
        runtime.connectPhotos({
          sourceBinding: "valid",
          networkAllowed: false,
        }),
        /bindings need attention/,
      );
      assert.equal(saved, 0);
      assert.equal(called, 0);
    } finally {
      await runtime.close();
    }
  }
});

test("queued Photos host intents snapshot the explicit network choice", async (t) => {
  const f = await fixture(t);
  const grant = { sourceBinding: "intent-source", networkAllowed: false };
  const pending = f.connect(grant);
  grant.networkAllowed = true;
  grant.sourceBinding = "mutated-source";
  await pending;
  assert.equal(f.grants[0].networkAllowed, false);
  await f.connect({ sourceBinding: "intent-source", networkAllowed: false });
  assert.equal(f.grants[0].namespace, f.grants[1].namespace);
});
