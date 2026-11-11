const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const zip = require("./zip-fixture.cjs");
const sha = (data) => createHash("sha256").update(data).digest("hex");
async function fixture(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-parts-")),
  );
  const source = path.join(root, "exports"),
    destination = path.join(root, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const files = ["part-1.zip", "part-2.zip", "unselected.zip"].map((name) =>
    path.join(source, name),
  );
  for (let i = 0; i < files.length; i++)
    await fs.writeFile(
      files[i],
      zip([
        { name: "photo.jpg", data: `original photo ${i}` },
        {
          name: "metadata/photo.json",
          data: JSON.stringify({ title: `Photo ${i}` }),
        },
      ]),
    );
  let runtime = await createMigrationRuntime(path.join(root, "profile"));
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const job = await runtime.request("create", { provider: "Flickr" });
  await runtime.request("archiveSet", { id: job.id, paths: files.slice(0, 2) });
  await runtime.request("destination", { id: job.id, path: destination });
  return {
    root,
    source,
    destination,
    files,
    job,
    get runtime() {
      return runtime;
    },
    async restart() {
      await runtime.close();
      runtime = await createMigrationRuntime(path.join(root, "profile"));
    },
  };
}
async function terminal(f) {
  for (let i = 0; i < 600; i++) {
    const job = (await f.runtime.request("list")).find(
      (j) => j.id === f.job.id,
    );
    if (!["running", "inspecting"].includes(job.state)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Archive job did not finish");
}
async function inspect(f) {
  await f.runtime.request("inspect", { id: f.job.id });
  const job = await terminal(f);
  assert.equal(job.state, "ready", job.error);
  return job;
}
test("selected export parts preserve originals, repeated filenames, metadata and history without importing unselected parts", async (t) => {
  const f = await fixture(t);
  const review = await inspect(f);
  assert.equal(review.inspection.files, 4);
  assert.equal(review.inspection.archives.length, 2);
  await f.runtime.request("start", { id: f.job.id });
  const done = await terminal(f);
  assert.equal(done.state, "verified", done.error);
  const receipt = JSON.parse(
    await fs.readFile(path.join(done.output, "report.json")),
  );
  assert.equal(receipt.originalArchives.length, 2);
  assert.equal(receipt.files.length, 4);
  assert.equal(receipt.interpreted, false);
  assert.equal(receipt.backedUp, false);
  for (let i = 0; i < 2; i++) {
    const name = path.basename(f.files[i]);
    const original = await fs.readFile(f.files[i]);
    assert.deepEqual(
      await fs.readFile(path.join(done.output, "original", name)),
      original,
    );
    assert.equal(receipt.originalArchives[i].sha256, sha(original));
    assert.equal(
      await fs.readFile(
        path.join(done.output, "files", name, "photo.jpg"),
        "utf8",
      ),
      `original photo ${i}`,
    );
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(
          path.join(done.output, "files", name, "metadata/photo.json"),
        ),
      ),
      { title: `Photo ${i}` },
    );
  }
  assert.deepEqual((await fs.readdir(path.join(done.output, "files"))).sort(), [
    "part-1.zip",
    "part-2.zip",
  ]);
  await f.restart();
  const saved = await terminal(f);
  assert.equal(saved.state, "verified");
  assert.deepEqual(saved.sourceArchives, ["part-1.zip", "part-2.zip"]);
  await f.runtime.request("start", { id: f.job.id });
  assert.equal((await terminal(f)).state, "verified");
  const target = path.join(done.output, "files/part-2.zip/photo.jpg");
  await fs.writeFile(target, "changed locally");
  await f.runtime.request("start", { id: f.job.id });
  const failed = await terminal(f);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /conflict|corruption/i);
  assert.equal(await fs.readFile(target, "utf8"), "changed locally");
});
test("changed parts invalidate reviewed content even when names and entry lengths are unchanged", async (t) => {
  const f = await fixture(t);
  await inspect(f);
  await fs.writeFile(
    f.files[1],
    zip([
      { name: "photo.jpg", data: "changed photo 1" },
      {
        name: "metadata/photo.json",
        data: JSON.stringify({ title: "Photo 1" }),
      },
    ]),
  );
  await f.runtime.request("start", { id: f.job.id });
  const failed = await terminal(f);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /source changed/i);
  assert.deepEqual(await fs.readdir(failed.output), []);
});
test("all parts are reviewed before writing; unsafe later archives and replacement links fail", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.files[1], zip([{ name: "../escape", data: "bad" }]));
  await f.runtime.request("inspect", { id: f.job.id });
  assert.equal((await terminal(f)).state, "failed");
  assert.deepEqual(await fs.readdir(f.destination), []);
  await fs.unlink(f.files[1]);
  await fs.symlink(f.files[2], f.files[1]);
  await f.runtime.request("inspect", { id: f.job.id });
  const failed = await terminal(f);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /links/i);
});
test("archive selection is atomic and bounded, rejects duplicates and mixed folders, and single-source replacement clears it", async (t) => {
  const f = await fixture(t);
  const before = await terminal(f);
  for (const paths of [
    [],
    Array(501).fill(f.files[0]),
    [f.files[0], f.files[0]],
    [f.files[0], f.destination],
  ])
    await assert.rejects(
      f.runtime.request("archiveSet", { id: f.job.id, paths }),
    );
  const elsewhere = path.join(f.root, "elsewhere.zip");
  await fs.copyFile(f.files[0], elsewhere);
  await assert.rejects(
    f.runtime.request("archiveSet", {
      id: f.job.id,
      paths: [f.files[0], elsewhere],
    }),
    /same folder/,
  );
  assert.deepEqual((await terminal(f)).sourceArchives, before.sourceArchives);
  await f.runtime.request("source", { id: f.job.id, path: f.files[0] });
  const replaced = await terminal(f);
  assert.equal(replaced.sourceKind, "zip");
  assert.equal(replaced.sourceArchives, undefined);
});
test("pause and restart retain part selection and resume without overwriting verified files", async (t) => {
  const f = await fixture(t);
  await inspect(f);
  await f.runtime.request("start", { id: f.job.id });
  await f.runtime.request("pause", { id: f.job.id });
  const paused = await terminal(f);
  assert.ok(["paused", "verified"].includes(paused.state), paused.error);
  await f.restart();
  await f.runtime.request("start", { id: f.job.id });
  const done = await terminal(f);
  assert.equal(done.state, "verified", done.error);
  assert.equal((await fs.readdir(f.destination)).length, 1);
});

test("authenticated local integrations can select export parts; unauthenticated callers cannot", async (t) => {
  const f = await fixture(t);
  const { startLocalApi } = require("../dist/http.cjs");
  const api = await startLocalApi(f.runtime);
  t.after(() => api.close());
  const url = `${api.url}/v1/jobs/${f.job.id}/archiveSet`;
  const body = JSON.stringify({ paths: [f.files[2]] });
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
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${api.token}`,
      "content-type": "application/json",
    },
    body,
  });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual((await terminal(f)).sourceArchives, ["unselected.zip"]);
  const review = await inspect(f);
  assert.equal(review.inspection.files, 2);
});

test("the entry limit applies to the combined selection rather than separately to each part", async (t) => {
  const f = await fixture(t);
  const content = zip(
    Array.from({ length: 10000 }, (_, i) => ({
      name: `file-${i}.txt`,
      data: "",
    })),
  );
  await fs.writeFile(f.files[0], content);
  await fs.writeFile(f.files[1], content);
  await f.runtime.request("inspect", { id: f.job.id });
  const job = await terminal(f);
  assert.equal(job.state, "failed");
  assert.match(job.error, /20,000/);
  assert.deepEqual(await fs.readdir(f.destination), []);
});
