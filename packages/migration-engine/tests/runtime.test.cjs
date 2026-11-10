const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { createMigrationRuntime } = require("../dist/backend.cjs");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "crux-migration-test-"));
  const source = path.join(root, "export");
  const dest = path.join(root, "destination");
  const profile = path.join(root, "profile");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  let runtime = await createMigrationRuntime(profile);
  t.after(async () => {
    await runtime?.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    source,
    dest,
    profile,
    get runtime() {
      return runtime;
    },
    async restart() {
      await runtime.close();
      runtime = await createMigrationRuntime(profile);
    },
  };
}
async function importJob(f) {
  const j = await f.runtime.request("create", { provider: "Dropbox" });
  await f.runtime.request("source", { id: j.id, path: f.source });
  await f.runtime.request("destination", { id: j.id, path: f.dest });
  await f.runtime.request("inspect", { id: j.id });
  const inspected = await terminal(f.runtime, j.id);
  assert.equal(inspected.state, "ready", inspected.error);
  return j;
}
async function terminal(runtime, id) {
  for (let n = 0; n < 300; n++) {
    const j = (await runtime.request("list")).find((j) => j.id === id);
    if (j.state !== "running" && j.state !== "inspecting") {
      await new Promise((r) => setTimeout(r, 60));
      return j;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Import did not finish");
}
test("shared local API starts with zero Cruxes; Mood and verified copy survive restart", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.runtime.request("info")).cruxCount, 0);
  await f.runtime.request("mood", { tokens: { accent: "#123456" } });
  await fs.mkdir(path.join(f.source, "photos"));
  await fs.writeFile(
    path.join(f.source, "photos", "memory.txt"),
    "A photograph description\n",
  );
  const j = await importJob(f);
  await f.runtime.request("start", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "verified", done.error);
  assert.equal(done.files, 1);
  assert.equal(
    await fs.readFile(
      path.join(done.output, "files/photos/memory.txt"),
      "utf8",
    ),
    "A photograph description\n",
  );
  const report = JSON.parse(
    await fs.readFile(path.join(done.output, "report.json"), "utf8"),
  );
  assert.equal(report.files[0].sha256.length, 64);
  assert.equal(report.backedUp, false);
  await f.runtime.request("checklist", {
    id: j.id,
    step: "downloaded",
    checked: true,
  });
  await f.restart();
  assert.equal((await f.runtime.request("list"))[0].checklist.downloaded, true);
  assert.equal((await f.runtime.request("info")).cruxCount, 0);
  assert.equal((await f.runtime.request("info")).mood.accent, "#123456");
  assert.equal((await f.runtime.request("list"))[0].state, "verified");
  await fs.writeFile(
    path.join(done.output, "files/photos/memory.txt"),
    "tampered",
  );
  await f.runtime.request("start", { id: j.id });
  const broken = await terminal(f.runtime, j.id);
  assert.equal(broken.state, "failed");
  assert.match(broken.error, /conflict|corruption/i);
  assert.equal(
    await fs.readFile(
      path.join(done.output, "files/photos/memory.txt"),
      "utf8",
    ),
    "tampered",
  );
});
test("destination cannot recurse into source; linked files are refused", async (t) => {
  const f = await fixture(t);
  const j = await f.runtime.request("create", { provider: "Dropbox" });
  await f.runtime.request("source", { id: j.id, path: f.source });
  await assert.rejects(
    f.runtime.request("destination", { id: j.id, path: f.source }),
    /outside/,
  );
  await f.runtime.request("destination", { id: j.id, path: f.dest });
  await fs.symlink("/etc/hosts", path.join(f.source, "linked.txt"));
  await f.runtime.request("inspect", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /Links/);
});
test("pause, restart and resume preserve exactly one verified copy", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 60; i++)
    await fs.writeFile(
      path.join(f.source, `file-${i}.bin`),
      Buffer.alloc(1024 * 128, i),
    );
  const j = await importJob(f);
  await f.runtime.request("start", { id: j.id });
  await f.runtime.request("pause", { id: j.id });
  assert.equal((await terminal(f.runtime, j.id)).state, "paused");
  await f.restart();
  await f.runtime.request("start", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "verified", done.error);
  assert.equal((await fs.readdir(path.join(done.output, "files"))).length, 60);
  await fs.writeFile(path.join(f.source, "new.txt"), "source changed");
  await f.runtime.request("start", { id: j.id });
  const changed = await terminal(f.runtime, j.id);
  assert.equal(changed.state, "failed");
  assert.match(changed.error, /source changed/);
});

test("review is required and changed sources are refused before copying", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, "original.txt"), "original");
  const j = await f.runtime.request("create", { provider: "Dropbox" });
  await f.runtime.request("source", { id: j.id, path: f.source });
  await f.runtime.request("destination", { id: j.id, path: f.dest });
  await assert.rejects(f.runtime.request("start", { id: j.id }), /Review/);
  await f.runtime.request("inspect", { id: j.id });
  const reviewed = await terminal(f.runtime, j.id);
  assert.equal(reviewed.inspection.files, 1);
  assert.equal(reviewed.inspection.bytes, 8);
  assert.ok(reviewed.inspection.availableBytes > 0);
  assert.ok(reviewed.inspection.requiredBytes >= reviewed.inspection.bytes);
  await fs.writeFile(path.join(f.source, "later.txt"), "later");
  await f.runtime.request("start", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /source changed/);
  assert.deepEqual(await fs.readdir(done.output), []);
});

test("a damaged or linked checkpoint is never treated as a verified receipt", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, "original.txt"), "original");
  const j = await importJob(f);
  await f.runtime.request("start", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  const report = path.join(done.output, "report.json");
  await fs.writeFile(report, '{"partial":true}');
  await f.runtime.request("start", { id: j.id });
  assert.equal((await terminal(f.runtime, j.id)).state, "failed");
  assert.equal(await fs.readFile(report, "utf8"), '{"partial":true}');
  await fs.unlink(report);
  const outside = path.join(f.root, "outside.json");
  await fs.writeFile(outside, '{"untouched":true}');
  await fs.symlink(outside, report);
  await f.runtime.request("start", { id: j.id });
  assert.equal((await terminal(f.runtime, j.id)).state, "failed");
  assert.equal(await fs.readFile(outside, "utf8"), '{"untouched":true}');
});

test("unsafe portable filenames fail review without writing a destination", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.source, "CON.txt"),
    "cannot preserve portably",
  );
  const j = await f.runtime.request("create", { provider: "Dropbox" });
  await f.runtime.request("source", { id: j.id, path: f.source });
  await f.runtime.request("destination", { id: j.id, path: f.dest });
  await f.runtime.request("inspect", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /filename/);
  assert.deepEqual(await fs.readdir(f.dest), []);
});

test("insufficient free space stops preservation before copying any bytes", async (t) => {
  const f = await fixture(t);
  const available = await fs.statfs(f.dest);
  const sparseBytes = available.bavail * available.bsize + 16 * 1024 ** 2;
  if (sparseBytes > 1024 ** 4) {
    t.skip("Fixture requires a disk with less than 1 TiB free");
    return;
  }
  const sparse = await fs.open(path.join(f.source, "sparse.bin"), "wx");
  await sparse.truncate(sparseBytes);
  await sparse.close();
  const j = await importJob(f);
  await f.runtime.request("start", { id: j.id });
  const done = await terminal(f.runtime, j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /free space/);
  assert.deepEqual(await fs.readdir(done.output), []);
});

test("catalog limits provider creation, checklist fields and external references", async (t) => {
  const f = await fixture(t);
  const guides = require("../../migration-providers/src/guides.json");
  assert.equal(guides.length, 31);
  assert.equal(new Set(guides.map((g) => g.name)).size, 31);
  for (const guide of guides) {
    assert.ok(guide.steps.length >= 3, guide.name);
    assert.ok(guide.sources.length, guide.name);
    for (let index = 0; index < guide.sources.length; index++) {
      const url = await f.runtime.request("guideLink", {
        provider: guide.name,
        index,
      });
      assert.equal(new URL(url).protocol, "https:");
      assert.equal(new URL(url).username, "");
    }
  }
  await assert.rejects(
    f.runtime.request("create", { provider: "invented-service" }),
    /provider/i,
  );
  await assert.rejects(
    f.runtime.request("guideLink", {
      provider: "Dropbox",
      index: -1,
      url: "file:///tmp/private",
    }),
    /Unknown guide/,
  );
  await assert.rejects(
    f.runtime.request("guideLink", { provider: "Dropbox", index: "0" }),
    /Unknown guide/,
  );
  const job = await f.runtime.request("create", { provider: "Flickr" });
  await assert.rejects(
    f.runtime.request("checklist", {
      id: job.id,
      step: "downloaded",
      checked: true,
    }),
    /Unknown checklist/,
  );
  await f.runtime.request("checklist", {
    id: job.id,
    step: "request",
    checked: true,
  });
  await f.restart();
  assert.equal((await f.runtime.request("list"))[0].checklist.request, true);
});

test("import history keeps newest-first order after restart", async (t) => {
  const f = await fixture(t);
  const ids = [];
  for (const provider of ["Dropbox", "Flickr", "Gmail"]) {
    ids.push((await f.runtime.request("create", { provider })).id);
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.deepEqual(
    (await f.runtime.request("list")).map((j) => j.id),
    [...ids].reverse(),
  );
  await f.restart();
  assert.deepEqual(
    (await f.runtime.request("list")).map((j) => j.id),
    [...ids].reverse(),
  );
});
