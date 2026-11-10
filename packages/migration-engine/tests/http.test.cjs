const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const { startLocalApi } = require("../dist/http.cjs");

test("local API completes a Dropbox preservation and shares durable jobs with the desktop service", async (t) => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migration-api-")),
  );
  const source = path.join(dir, "export"),
    destination = path.join(dir, "copies"),
    profile = path.join(dir, "profile");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(source, "memory.txt"), "Keep this original.");
  let service = await createMigrationRuntime(profile);
  let api = await startLocalApi(service);
  t.after(async () => {
    await api.close();
    await service.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const call = async (url, method = "GET", data) => {
    const response = await fetch(api.url + url, {
      method,
      headers: {
        authorization: "Bearer " + api.token,
        "content-type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const reply = await response.json();
    assert.equal(response.status, 200, JSON.stringify(reply));
    return reply.result;
  };
  const job = await call("/v1/jobs", "POST", { provider: "Dropbox" });
  await call(`/v1/jobs/${job.id}/source`, "POST", { path: source });
  await call(`/v1/jobs/${job.id}/destination`, "POST", { path: destination });
  await call(`/v1/jobs/${job.id}/inspect`, "POST", {});
  async function wait(state) {
    for (let i = 0; i < 300; i++) {
      const item = (await call("/v1/jobs")).find((x) => x.id === job.id);
      assert.notEqual(item.state, "failed", item.error);
      if (item.state === state) return item;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("Job did not settle");
  }
  await wait("ready");
  await call(`/v1/jobs/${job.id}/start`, "POST", {});
  const done = await wait("verified");
  assert.equal(
    await fs.readFile(path.join(done.output, "files/memory.txt"), "utf8"),
    "Keep this original.",
  );
  assert.equal((await service.request("list"))[0].id, job.id);
  const token = api.token;
  await api.close();
  await service.close();
  service = await createMigrationRuntime(profile);
  api = await startLocalApi(service);
  assert.notEqual(api.token, token);
  assert.equal((await call("/v1/jobs"))[0].state, "verified");
  assert.equal((await call("/v1/info")).cruxCount, 0);
});

test("local API rejects unauthenticated, browser-origin and unsupported requests", async (t) => {
  const requests = [];
  const api = await startLocalApi({
    async request(...args) {
      requests.push(args);
      return [];
    },
  });
  t.after(() => api.close());
  assert.equal((await fetch(api.url + "/v1/jobs")).status, 403);
  assert.equal(
    (
      await fetch(api.url + "/v1/jobs", {
        headers: { authorization: "Bearer wrong" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(api.url + "/v1/jobs", {
        headers: {
          authorization: "Bearer " + api.token,
          origin: "https://example.com",
        },
      })
    ).status,
    403,
  );
  const wrongHostStatus = await new Promise((resolve, reject) => {
    const req = require("node:http").get(
      api.url + "/v1/jobs",
      {
        headers: { authorization: "Bearer " + api.token, host: "example.com" },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal(
    (
      await fetch(api.url + "/v1/sql", {
        headers: { authorization: "Bearer " + api.token },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(api.url + "/v1/jobs", {
        method: "POST",
        headers: {
          authorization: "Bearer " + api.token,
          "content-type": "application/json",
        },
        body: "[]",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(api.url + "/v1/jobs", {
        method: "POST",
        headers: {
          authorization: "Bearer " + api.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ padding: "x".repeat(150001) }),
      })
    ).status,
    400,
  );
  assert.equal(requests.length, 0);
});

test("an embedded host can supply its existing store without opening a second database", async (t) => {
  const saved = new Map();
  let closed = false;
  const store = {
    async loadJobs() {
      return [...saved.values()];
    },
    async saveJob(job) {
      saved.set(job.id, structuredClone(job));
    },
    async getMood() {
      return {};
    },
    async setMood() {},
    async cruxCount() {
      return 0;
    },
    async close() {
      closed = true;
    },
  };
  const service = await createMigrationRuntime("/not-a-real-profile", {
    store,
  });
  t.after(() => service.close());
  const created = await service.request("create", { provider: "Dropbox" });
  created.provider = "mutated outside engine";
  assert.equal((await service.request("list"))[0].provider, "Dropbox");
  await Promise.all([
    service.request("mood", { tokens: {} }),
    service.request("create", { provider: "Dropbox" }),
  ]);
  assert.equal(saved.size, 2);
  assert.equal(closed, false);
});
