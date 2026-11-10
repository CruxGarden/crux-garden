const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { once } = require("node:events");
test("headless service owns its profile, rotates credentials, and shuts down without orphaning SQLite", async (t) => {
  const profile = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migration-headless-")),
  );
  const children = [];
  t.after(async () => {
    for (const p of children)
      if (p.exitCode === null) {
        const done = once(p, "exit");
        p.kill("SIGTERM");
        await done;
      }
    await fs.rm(profile, { recursive: true, force: true });
  });
  const launch = () => {
    const p = spawn(
      process.execPath,
      [path.resolve(__dirname, "../dist/backend.cjs"), "--serve", profile],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    p.stderr.resume();
    children.push(p);
    return p;
  };
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      try {
        return JSON.parse(
          await fs.readFile(path.join(profile, "local-api.json"), "utf8"),
        );
      } catch {}
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error("API did not start");
  };
  const first = launch();
  const connection = await ready();
  assert.equal(
    (await fs.stat(path.join(profile, "local-api.json"))).mode & 0o777,
    0o600,
  );
  assert.equal(
    (
      await fetch(connection.url + "/v1/info", {
        headers: { authorization: "Bearer " + connection.token },
      })
    ).status,
    200,
  );
  const duplicate = launch();
  const [code] = await once(duplicate, "exit");
  assert.equal(code, 1);
  const done = once(first, "exit");
  first.kill("SIGTERM");
  await done;
  await assert.rejects(fs.stat(path.join(profile, "local-api.json")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.stat(path.join(profile, "service.lock")), {
    code: "ENOENT",
  });
  const second = launch();
  const next = await ready();
  assert.notEqual(next.token, connection.token);
  const finish = once(second, "exit");
  second.kill("SIGTERM");
  await finish;
});
