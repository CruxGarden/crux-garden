const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { buildSync } = require("../../../node_modules/esbuild");
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
const { compareLocalFiles, COMPARISON_LIMITS } = load("local-comparison");
const { fingerprint } = load("cloud/fingerprints");
const { openMigrationStore } = load("store");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const { startLocalApi } = require("../dist/http.cjs");
const signal = () => new AbortController().signal;
async function fixture(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-compare-")),
  );
  const source = path.join(root, "source"),
    copies = path.join(root, "copies");
  await fs.mkdir(source);
  await fs.mkdir(copies);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, bytes] of [
    ["renamed.txt", "same bytes"],
    ["new.txt", "new bytes"],
  ])
    await fs.writeFile(path.join(source, name), bytes);
  const known = path.join(copies, "old-name.txt");
  await fs.writeFile(known, "same bytes");
  const entry = await fingerprint(known, signal());
  return { root, source, copies, known, entry };
}
const compare = (f, names, lookup, options = {}) =>
  compareLocalFiles(
    f.source,
    names,
    lookup,
    options.signal || signal(),
    options.progress || (() => {}),
    options.limits || COMPARISON_LIMITS,
  );
async function settled(runtime, id) {
  for (let i = 0; i < 300; i++) {
    const j = (await runtime.request("list")).find((j) => j.id === id);
    if (j.localComparison?.state !== "running") return j;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("comparison timeout");
}
test("current bytes match renamed content, reject stale catalog bytes, and exclude the source itself", async (t) => {
  const f = await fixture(t);
  const self = await fingerprint(path.join(f.source, "renamed.txt"), signal());
  const stale = path.join(f.copies, "stale");
  await fs.writeFile(stale, "changed");
  const result = await compare(f, ["renamed.txt", "new.txt"], async (sha) =>
    sha === f.entry.sha256 ? [self, { ...f.entry, path: stale }, f.entry] : [],
  );
  assert.deepEqual(result.counts, {
    matched: 1,
    notFound: 1,
    unavailableCandidates: 1,
    candidatesChecked: 2,
  });
  assert.equal(result.preview[0].match, f.known);
  assert.equal(
    (await compare(f, ["renamed.txt"], async () => [self])).counts.notFound,
    1,
  );
  await fs.unlink(f.known);
  const missing = await compare(f, ["renamed.txt"], async () => [f.entry]);
  assert.equal(missing.counts.unavailableCandidates, 1);
  assert.equal(
    await fs.readFile(path.join(f.source, "renamed.txt"), "utf8"),
    "same bytes",
  );
});
test("symlinks and changed selected files cannot publish trusted results", async (t) => {
  const f = await fixture(t);
  const link = path.join(f.copies, "link");
  await fs.symlink(f.known, link);
  assert.equal(
    (
      await compare(f, ["renamed.txt"], async () => [
        { ...f.entry, path: link },
      ])
    ).counts.unavailableCandidates,
    1,
  );
  const ancestor = path.join(f.root, "alias");
  await fs.symlink(f.copies, ancestor);
  assert.equal(
    (
      await compare(f, ["renamed.txt"], async () => [
        { ...f.entry, path: path.join(ancestor, "old-name.txt") },
      ])
    ).counts.unavailableCandidates,
    1,
  );
  await assert.rejects(
    compare(f, ["renamed.txt"], async () => {
      await fs.writeFile(path.join(f.source, "renamed.txt"), "changed");
      return [f.entry];
    }),
    /changed/,
  );
  await fs.unlink(path.join(f.source, "renamed.txt"));
  await fs.symlink(f.known, path.join(f.source, "renamed.txt"));
  await assert.rejects(
    compare(f, ["renamed.txt"], async () => []),
    /link/,
  );
});
test("read, candidate, selection and preview limits are enforced without raising memory budgets", async (t) => {
  const f = await fixture(t);
  for (const limits of [
    { ...COMPARISON_LIMITS, fileBytes: 2 },
    { ...COMPARISON_LIMITS, readBytes: 12 },
  ])
    await assert.rejects(
      compare(f, ["renamed.txt"], async () => [f.entry], { limits }),
      /limit|budget/,
    );
  await assert.rejects(
    compare(f, Array(501).fill("renamed.txt"), async () => []),
    /500/,
  );
  await assert.rejects(compare(f, ["../copies/old-name.txt"], async () => []));
  await assert.rejects(
    compare(f, ["renamed.txt", "renamed.txt"], async () => []),
    /Colliding/,
  );
  const candidates = Array.from({ length: 21 }, (_, i) => ({
    ...f.entry,
    path: i === 20 ? f.known : path.join(f.copies, "missing-" + i),
  }));
  const bounded = await compare(f, ["renamed.txt"], async () => candidates);
  assert.equal(bounded.counts.notFound, 1);
  assert.equal(bounded.counts.candidatesChecked, 20);
  const names = [];
  for (let i = 0; i < 55; i++) {
    const name = `empty-${i}`;
    names.push(name);
    await fs.writeFile(path.join(f.source, name), "");
  }
  const rows = await compare(f, names, async () => []);
  assert.equal(rows.checked, 55);
  assert.equal(rows.preview.length, 50);
});
test("cancellation and catalog failure reject the whole observation", async (t) => {
  const f = await fixture(t),
    abort = new AbortController();
  await assert.rejects(
    compare(f, ["renamed.txt", "new.txt"], async () => [], {
      signal: abort.signal,
      progress: () => abort.abort(),
    }),
  );
  await assert.rejects(
    compare(f, ["renamed.txt"], async () => {
      throw Error("catalog unavailable");
    }),
    /catalog unavailable/,
  );
});
test("API-owned catalog, HTTP dispatch, worker completion and restart retain read-only results", async (t) => {
  const f = await fixture(t),
    profile = path.join(f.root, "profile");
  let store = await openMigrationStore(profile);
  await store.putFingerprint(f.entry);
  await store.close();
  let runtime = await createMigrationRuntime(profile);
  let api = await startLocalApi(runtime);
  t.after(async () => {
    await api.close();
    await runtime.close();
  });
  const job = await runtime.request("create", { provider: "iCloud Drive" });
  await assert.rejects(
    runtime.request("localCompare", { id: job.id }),
    /explicit/,
  );
  await runtime.request("fileSet", {
    id: job.id,
    paths: ["renamed.txt", "new.txt"].map((n) => path.join(f.source, n)),
  });
  const response = await fetch(`${api.url}/v1/jobs/${job.id}/localCompare`, {
    method: "POST",
    headers: {
      authorization: "Bearer " + api.token,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 200);
  const done = await settled(runtime, job.id);
  assert.equal(
    done.localComparison.state,
    "complete",
    done.localComparison.error,
  );
  assert.equal(done.localComparison.counts.matched, 1);
  assert.equal(done.output, undefined);
  await api.close();
  await runtime.close();
  runtime = await createMigrationRuntime(profile);
  api = await startLocalApi(runtime);
  assert.deepEqual(
    (await runtime.request("list"))[0].localComparison,
    done.localComparison,
  );
  await runtime.request("fileSet", {
    id: job.id,
    paths: [path.join(f.source, "new.txt")],
  });
  assert.equal((await runtime.request("list"))[0].localComparison, undefined);
});
test("worker pause releases ownership; interrupted persisted results restart as paused with no counts", async (t) => {
  const f = await fixture(t),
    profile = path.join(f.root, "profile");
  let runtime = await createMigrationRuntime(profile);
  t.after(() => runtime.close());
  const job = await runtime.request("create", { provider: "Dropbox" });
  await runtime.request("fileSet", {
    id: job.id,
    paths: [path.join(f.source, "renamed.txt")],
  });
  await runtime.request("localCompare", { id: job.id });
  await assert.rejects(
    runtime.request("fileSet", { id: job.id, paths: [f.known] }),
    /Pause/,
  );
  await runtime.request("pause", { id: job.id });
  assert.equal(
    (await settled(runtime, job.id)).localComparison.state,
    "paused",
  );
  await runtime.request("localCompare", { id: job.id });
  assert.equal(
    (await settled(runtime, job.id)).localComparison.state,
    "complete",
  );
  await runtime.close();
  const store = await openMigrationStore(profile);
  const saved = (await store.loadJobs())[0];
  saved.localComparison = { state: "running", counts: { matched: 100 } };
  await store.saveJob(saved);
  await store.close();
  runtime = await createMigrationRuntime(profile);
  const restored = (await runtime.request("list"))[0].localComparison;
  assert.equal(restored.state, "paused");
  assert.equal(restored.counts, undefined);
});
