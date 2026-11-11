const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const { wait } = require("./photo-fixture.cjs");
async function fixture(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-selected-")),
  );
  const source = path.join(root, "source"),
    destination = path.join(root, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const data = {
    "IMG_01.HEIC": "original image",
    "IMG_01.MOV": "original video",
    "IMG_01.xmp": "<x:xmpmeta>untouched fixture</x:xmpmeta>",
    "not-selected.txt": "excluded",
  };
  for (const [name, bytes] of Object.entries(data))
    await fs.writeFile(path.join(source, name), bytes);
  let runtime = await createMigrationRuntime(path.join(root, "profile"));
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const job = await runtime.request("create", { provider: "iCloud Photos" });
  const selected = Object.keys(data).slice(0, 3),
    paths = selected.map((n) => path.join(source, n));
  await runtime.request("fileSet", { id: job.id, paths });
  await runtime.request("destination", { id: job.id, path: destination });
  return {
    root,
    source,
    destination,
    job,
    selected,
    paths,
    data,
    get runtime() {
      return runtime;
    },
    async restart() {
      await runtime.close();
      runtime = await createMigrationRuntime(path.join(root, "profile"));
    },
    async run(command) {
      await runtime.request(command, { id: job.id });
      return wait(runtime, job.id);
    },
  };
}
test("selected files preserve only explicit photo components and record fingerprints across restart", async (t) => {
  const f = await fixture(t);
  // A sibling with an invalid portable name and a link must not be traversed.
  await fs.writeFile(path.join(f.source, "ignored:unsafe.txt"), "ignored");
  await fs.symlink(f.paths[0], path.join(f.source, "ignored-link"));
  assert.equal((await f.run("inspect")).inspection.files, 3);
  await fs.writeFile(
    path.join(f.source, "not-selected.txt"),
    "changed outside selection",
  );
  const done = await f.run("start");
  assert.equal(done.state, "verified", done.error);
  assert.deepEqual(
    (await fs.readdir(path.join(done.output, "files"))).sort(),
    f.selected.sort(),
  );
  for (const name of f.selected)
    assert.equal(
      await fs.readFile(path.join(done.output, "files", name), "utf8"),
      f.data[name],
    );
  const report = JSON.parse(
    await fs.readFile(path.join(done.output, "report.json")),
  );
  assert.equal(report.sourceKind, "file-set");
  assert.deepEqual(report.selectedFiles, f.selected);
  assert.ok(report.files.every((x) => /^[a-f0-9]{64}$/.test(x.sha256)));
  await f.restart();
  const retained = (await f.runtime.request("list"))[0];
  assert.deepEqual(retained.sourceFiles, f.selected);
  assert.equal((await f.run("start")).state, "verified");
  await fs.writeFile(
    path.join(done.output, "files", f.selected[0]),
    "changed output",
  );
  assert.equal((await f.run("start")).state, "failed");
  assert.equal(await fs.readFile(f.paths[0], "utf8"), f.data["IMG_01.HEIC"]);
});
test("invalid file selections are atomic and bounded, cannot grant directories or links", async (t) => {
  const f = await fixture(t);
  const before = (await f.runtime.request("list"))[0];
  const outside = path.join(f.root, "other.txt");
  await fs.writeFile(outside, "other");
  const link = path.join(f.source, "link.txt");
  await fs.symlink(f.paths[0], link);
  for (const paths of [
    [],
    Array(501).fill(f.paths[0]),
    [f.paths[0], f.paths[0]],
    [f.paths[0], outside],
    [f.source],
    [link],
    [path.join(f.source, "missing")],
  ]) {
    await assert.rejects(f.runtime.request("fileSet", { id: f.job.id, paths }));
    assert.deepEqual((await f.runtime.request("list"))[0], before);
  }
  await assert.rejects(
    f.runtime.request("fileSet", { id: f.job.id, paths: ["relative-missing"] }),
  );
});
test("a selected file change or symlink replacement invalidates review before publication", async (t) => {
  const f = await fixture(t);
  await f.run("inspect");
  await fs.writeFile(f.paths[0], "changed before copy");
  assert.match((await f.run("start")).error, /source changed/i);
  const second = await f.runtime.request("create", {
    provider: "iCloud Drive",
  });
  await f.runtime.request("fileSet", { id: second.id, paths: [f.paths[1]] });
  await f.runtime.request("destination", {
    id: second.id,
    path: f.destination,
  });
  await f.runtime.request("inspect", { id: second.id });
  await wait(f.runtime, second.id);
  await fs.unlink(f.paths[1]);
  await fs.symlink(f.paths[0], f.paths[1]);
  await f.runtime.request("start", { id: second.id });
  const failed = await wait(f.runtime, second.id);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /link|regular/);
  await assert.rejects(fs.stat(path.join(failed.output, "report.json")));
});
test("file selection modes replace each other and metadata review sees only selected files", async (t) => {
  const f = await fixture(t);
  const photo = path.join(f.source, "image.jpg"),
    sidecar = photo + ".json";
  await fs.writeFile(photo, "synthetic image");
  await fs.writeFile(
    sidecar,
    JSON.stringify({
      title: "image.jpg",
      photoTakenTime: { timestamp: "123" },
    }),
  );
  const j = await f.runtime.request("create", { provider: "Google Photos" });
  await f.runtime.request("fileSet", { id: j.id, paths: [photo] });
  await f.runtime.request("source", { id: j.id, path: f.source });
  assert.equal(
    (await f.runtime.request("list")).find((x) => x.id === j.id).sourceFiles,
    undefined,
  );
  await f.runtime.request("fileSet", { id: j.id, paths: [photo, sidecar] });
  await f.runtime.request("destination", { id: j.id, path: f.destination });
  await f.runtime.request("inspect", { id: j.id });
  await wait(f.runtime, j.id);
  await f.runtime.request("start", { id: j.id });
  assert.equal((await wait(f.runtime, j.id)).state, "verified");
  await f.runtime.request("photoReview", { id: j.id });
  assert.equal(
    (await wait(f.runtime, j.id, true)).photoReview.counts.matched,
    1,
  );
  await assert.rejects(
    f.runtime.request("fileSet", { id: j.id, paths: [photo] }),
    /new import/,
  );
});
test("file selection uses authenticated local API and ordinary archives remain opaque files", async (t) => {
  const f = await fixture(t);
  const { startLocalApi } = require("../dist/http.cjs");
  const api = await startLocalApi(f.runtime);
  t.after(() => api.close());
  const archive = path.join(f.source, "not-a-real.zip");
  await fs.writeFile(archive, "opaque selected file, not unpacked");
  const url = `${api.url}/v1/jobs/${f.job.id}/fileSet`,
    body = JSON.stringify({ paths: [archive] });
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${api.token}`,
        },
        body,
      })
    ).status,
    200,
  );
  assert.equal((await f.run("inspect")).inspection.files, 1);
  const done = await f.run("start");
  assert.equal(done.state, "verified", done.error);
  assert.equal(
    await fs.readFile(
      path.join(done.output, "files", "not-a-real.zip"),
      "utf8",
    ),
    "opaque selected file, not unpacked",
  );
});
