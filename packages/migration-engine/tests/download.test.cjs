const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const { startLocalApi } = require("../dist/http.cjs");
const link =
  "https://www.dropbox.com/scl/fi/test-token/example.bin?rlkey=never-persist-this-secret&dl=0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fixture(t, mode = "normal") {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-download-")),
  );
  const body = Buffer.alloc(9 * 1024 * 1024, 73);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push({ ...req.headers });
    if (mode === "redirect") {
      res.writeHead(302, {
        location: "https://evil.example/private?rlkey=secret",
      });
      res.end();
      return;
    }
    if (mode === "limit") {
      res.writeHead(429, { "retry-after": "20" });
      res.end();
      return;
    }
    const offset = req.headers.range
      ? Number(/bytes=(\d+)-/.exec(req.headers.range)[1])
      : 0;
    const resume = offset > 0 && mode !== "no-range";
    const headers = {
      "content-length": body.length - (resume ? offset : 0),
      "content-disposition": 'attachment; filename="example.bin"',
      etag: mode === "changed" && offset ? '"new"' : '"stable"',
    };
    if (resume)
      headers["content-range"] =
        `bytes ${mode === "bad-range" ? offset + 1 : offset}-${body.length - 1}/${body.length}`;
    if (mode === "weak") headers.etag = 'W/"weak"';
    if (mode === "html") delete headers["content-disposition"];
    res.writeHead(resume ? 206 : 200, headers);
    for (
      let at = resume ? offset : 0;
      at < body.length && !res.destroyed;
      at += 64 * 1024
    ) {
      if (mode === "disconnect" && !offset && at >= 5 * 1024 * 1024) {
        res.destroy();
        return;
      }
      res.write(body.subarray(at, at + 64 * 1024));
      await sleep(3);
    }
    if (!res.destroyed) res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const open = (url, headers, signal) =>
    new Promise((resolve, reject) => {
      assert.match(url.hostname, /dropbox/);
      const req = http.get(
        `http://127.0.0.1:${server.address().port}/`,
        { headers, signal },
        resolve,
      );
      req.on("error", reject);
    });
  let service = await createMigrationRuntime(path.join(dir, "profile"), {
    downloadOpen: open,
  });
  t.after(async () => {
    await service.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const call = (...args) => service.request(...args);
  async function job() {
    const j = await call("downloadCreate", { link });
    await call("downloadDestination", { id: j.id, path: dir });
    return j;
  }
  async function wait(id, condition) {
    for (let i = 0; i < 500; i++) {
      const j = (await call("downloads")).find((j) => j.id === id);
      if (condition(j)) return j;
      await sleep(10);
    }
    throw Error("Download did not settle");
  }
  return {
    dir,
    body,
    requests,
    call,
    job,
    wait,
    get service() {
      return service;
    },
    async restart() {
      await service.close();
      service = await createMigrationRuntime(path.join(dir, "profile"), {
        downloadOpen: open,
      });
    },
  };
}
test("Dropbox download checkpoints, restarts, resumes exact bytes, and enters review without persisting the link", async (t) => {
  const f = await fixture(t);
  const j = await f.job();
  await f.call("downloadStart", { id: j.id, link });
  await f.wait(j.id, (x) => x.bytes >= 4 * 1024 * 1024);
  await f.call("downloadPause", { id: j.id });
  const paused = await f.wait(j.id, (x) => x.state === "paused");
  assert(paused.bytes > 0 && paused.bytes < f.body.length);
  await f.restart();
  await assert.rejects(
    f.call("downloadStart", {
      id: j.id,
      link: link.replace("test-token", "another"),
    }),
    /same Dropbox link/,
  );
  await f.call("downloadStart", { id: j.id, link });
  const done = await f.wait(j.id, (x) => x.state === "downloaded");
  assert.equal(f.requests.at(-1).range, `bytes=${paused.bytes}-`);
  assert.equal(f.requests.at(-1)["if-range"], '"stable"');
  assert.deepEqual(
    await fs.readFile(path.join(done.folder, "example.bin")),
    f.body,
  );
  assert.equal(done.sha256, createHash("sha256").update(f.body).digest("hex"));
  assert.deepEqual(await fs.readdir(done.folder), ["example.bin"]);
  assert(!JSON.stringify(await f.call("downloads")).includes("never-persist"));
  assert(
    !(await fs.readFile(path.join(f.dir, "profile/migration.db"))).includes(
      Buffer.from("never-persist"),
    ),
  );
  const imported = await f.call("downloadImport", { id: j.id });
  await fs.mkdir(path.join(f.dir, "preserved"));
  await f.call("destination", {
    id: imported.id,
    path: path.join(f.dir, "preserved"),
  });
  await f.call("inspect", { id: imported.id });
  for (let i = 0; i < 200; i++) {
    if ((await f.call("list"))[0].inspection) break;
    await sleep(10);
  }
  assert.equal((await f.call("list"))[0].inspection.bytes, f.body.length);
});
for (const mode of ["changed", "no-range", "bad-range", "weak"])
  test(`Dropbox refuses unsafe resume: ${mode}`, async (t) => {
    const f = await fixture(t, mode);
    const j = await f.job();
    await f.call("downloadStart", { id: j.id, link });
    await f.wait(j.id, (x) => x.bytes >= 4 * 1024 * 1024);
    await f.call("downloadPause", { id: j.id });
    await f.restart();
    await f.call("downloadStart", { id: j.id, link });
    const failed = await f.wait(j.id, (x) => x.state === "failed");
    assert.match(failed.error, /Start a new download/);
    await assert.rejects(fs.stat(path.join(failed.folder, "example.bin")), {
      code: "ENOENT",
    });
  });
for (const mode of ["redirect", "limit", "html"])
  test(`Dropbox rejects ${mode} without publishing a file or exposing a link`, async (t) => {
    const f = await fixture(t, mode);
    const j = await f.job();
    await f.call("downloadStart", { id: j.id, link });
    const failed = await f.wait(j.id, (x) => x.state === "failed");
    assert(!failed.error.includes("https:"));
    assert.equal(f.requests.length, 1);
    assert.deepEqual(await fs.readdir(failed.folder), ["download.partial"]);
  });
test("Modified partial files are rejected before any resumed network access", async (t) => {
  const f = await fixture(t);
  const j = await f.job();
  await f.call("downloadStart", { id: j.id, link });
  await f.wait(j.id, (x) => x.bytes >= 4 * 1024 * 1024);
  await f.call("downloadPause", { id: j.id });
  const paused = (await f.call("downloads"))[0];
  const partial = await fs.open(
    path.join(paused.folder, "download.partial"),
    "r+",
  );
  await partial.write(Buffer.from("bad"), 0, 3, 0);
  await partial.close();
  const calls = f.requests.length;
  await f.call("downloadStart", { id: j.id, link });
  const failed = await f.wait(j.id, (x) => x.state === "failed");
  assert.match(failed.error, /partial download changed/);
  assert.equal(f.requests.length, calls);
});
test("Local API exposes downloads with the same authorization and native path boundary", async (t) => {
  const f = await fixture(t, "limit");
  const api = await startLocalApi(f.service);
  t.after(() => api.close());
  const post = async (route, data) => {
    const r = await fetch(api.url + route, {
      method: "POST",
      headers: {
        authorization: "Bearer " + api.token,
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    });
    assert.equal(r.status, 200);
    return (await r.json()).result;
  };
  assert.equal((await fetch(api.url + "/v1/downloads")).status, 403);
  const job = await post("/v1/downloads", { link });
  await post(`/v1/downloads/${job.id}/destination`, { path: f.dir });
  await post(`/v1/downloads/${job.id}/start`, { link });
  await f.wait(job.id, (j) => j.state === "failed");
  for (const value of [
    "http://www.dropbox.com/s/id/x",
    "https://evil.example/s/id/x",
    "https://www.dropbox.com/scl/fo/folder",
    "https://www.dropbox.com/s/id/%2e%2e",
    "https://www.dropbox.com/s/id/a%2Fb",
    "https://www.dropbox.com:444/s/id/x",
  ])
    await assert.rejects(f.call("downloadCreate", { link: value }));
});

test("Connection loss retains a checkpoint and retries without concatenating an uncheckpointed tail", async (t) => {
  const f = await fixture(t, "disconnect");
  const j = await f.job();
  await f.call("downloadStart", { id: j.id, link });
  const failed = await f.wait(j.id, (x) => x.state === "failed");
  assert(failed.bytes >= 4 * 1024 * 1024);
  await f.restart();
  await f.call("downloadStart", { id: j.id, link });
  const done = await f.wait(j.id, (x) => x.state === "downloaded");
  assert.deepEqual(
    await fs.readFile(path.join(done.folder, "example.bin")),
    f.body,
  );
});
test("A replaced partial cannot overwrite another file through a hard link", async (t) => {
  const f = await fixture(t);
  const j = await f.job();
  const ready = (await f.call("downloads"))[0];
  const unrelated = path.join(f.dir, "keep.txt");
  await fs.writeFile(unrelated, "Keep this");
  await fs.unlink(path.join(ready.folder, "download.partial"));
  await fs.link(unrelated, path.join(ready.folder, "download.partial"));
  await f.call("downloadStart", { id: j.id, link });
  const failed = await f.wait(j.id, (x) => x.state === "failed");
  assert.match(failed.error, /partial download changed/);
  assert.equal(await fs.readFile(unrelated, "utf8"), "Keep this");
  assert.equal(f.requests.length, 0);
});
test("Publishing a download never overwrites a destination file", async (t) => {
  const f = await fixture(t);
  const j = await f.job();
  const ready = (await f.call("downloads"))[0];
  await fs.writeFile(path.join(ready.folder, "example.bin"), "Existing file");
  await f.call("downloadStart", { id: j.id, link });
  const failed = await f.wait(j.id, (x) => x.state === "failed");
  assert.match(failed.error, /already exists/);
  assert.equal(
    await fs.readFile(path.join(ready.folder, "example.bin"), "utf8"),
    "Existing file",
  );
});

test("A non-resumable response can be explicitly restarted without appending old bytes", async (t) => {
  const f = await fixture(t, "weak");
  const j = await f.job();
  await f.call("downloadStart", { id: j.id, link });
  await f.wait(j.id, (x) => x.bytes >= 4 * 1024 * 1024);
  await f.call("downloadPause", { id: j.id });
  await f.call("downloadRestart", { id: j.id, link });
  const done = await f.wait(j.id, (x) => x.state === "downloaded");
  assert.equal(f.requests.at(-1).range, undefined);
  assert.deepEqual(
    await fs.readFile(path.join(done.folder, "example.bin")),
    f.body,
  );
});
