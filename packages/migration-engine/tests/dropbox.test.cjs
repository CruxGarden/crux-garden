const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { dropboxFixture } = require("./dropbox-fixture.cjs");
const { sleep } = require("./cloud-fixture.cjs");
const downloads = (f) => f.calls.filter((v) => v.path === "/2/files/download");
test("Dropbox system-browser PKCE uses exact callback, rejects wrong state and handles occupied callback port", async (t) => {
  const f = await dropboxFixture(t),
    auth = await f.authorize(),
    url = new URL(auth.authorizationUrl);
  assert.equal(url.origin, "https://www.dropbox.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://127.0.0.1:53683/callback/dropbox",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("token_access_type"), "offline");
  await assert.rejects(f.authorize(), /53683/);
  const wrong = new URL(url.searchParams.get("redirect_uri"));
  wrong.search = "code=secret&state=wrong";
  assert.equal((await fetch(wrong)).status, 400);
  assert.equal(f.calls.length, 0);
  const c = await f.complete(auth);
  assert.equal(c.state, "connected", c.error);
  const token = f.calls.find((v) => v.path === "/oauth2/token");
  assert.equal(token.method, "POST");
  assert.equal(token.args.redirect_uri, url.searchParams.get("redirect_uri"));
  assert.equal(token.args.client_secret, undefined);
  assert.equal(
    createHash("sha256").update(token.args.code_verifier).digest("base64url"),
    url.searchParams.get("code_challenge"),
  );
  await f.call("cloudDisconnect", { connection: c.id });
  const again = await f.connect();
  assert.equal(again.state, "connected", again.error);
});
test("Dropbox paginates selected folders, verifies provider hashes and reuses identical bytes without copying credentials", async (t) => {
  const f = await dropboxFixture(t),
    c = await f.connect();
  assert.equal(c.state, "connected", c.error);
  const j = await f.prepare(c.id, ["id:folder"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 2);
  assert.equal(done.reusedFiles, 1);
  assert.equal(downloads(f).length, 1);
  assert.equal(
    JSON.parse(downloads(f)[0].headers["dropbox-api-arg"]).rev,
    "123456789",
  );
  const first = path.join(done.folder, "files/Trips/café 📷.jpg"),
    second = path.join(done.folder, "files/Trips/second.jpg");
  assert.deepEqual(await fs.readFile(first), f.bytes);
  assert.notEqual((await fs.stat(first)).ino, (await fs.stat(second)).ino);
  const manifest = await fs.readFile(
    path.join(done.folder, "migration-manifest.json"),
    "utf8",
  );
  assert(!manifest.includes("unselected"));
  const db = await fs.readFile(path.join(f.dir, "profile/migration.db"));
  for (const secret of [
    "fixture-dropbox-token",
    "fixture-dropbox-refresh",
    "fixture-dropbox-code",
  ]) {
    assert(!manifest.includes(secret));
    assert(!db.includes(secret));
  }
  assert(f.calls.some((v) => v.path.endsWith("list_folder/continue")));
  assert(
    f.calls.every(
      (v) =>
        v.host === "api.dropboxapi.com" || v.host === "content.dropboxapi.com",
    ),
  );
  await f.restart();
  const c2 = await f.connect();
  const j2 = await f.prepare(c2.id, ["id:folder"]);
  await f.call("cloudStart", { id: j2.id, connection: c2.id });
  const again = await f.settle(j2.id);
  assert.equal(again.state, "downloaded", again.error);
  assert.equal(again.reusedFiles, 2);
  assert.equal(downloads(f).length, 1);
});
test("Dropbox expired session refreshes through bounded form transport and insufficient scope fails", async (t) => {
  const f = await dropboxFixture(t);
  f.state.refresh = true;
  const c = await f.connect();
  assert.equal(c.state, "connected", c.error);
  assert(f.calls.some((v) => v.args.grant_type === "refresh_token"));
  await f.call("cloudDisconnect", { connection: c.id });
  f.state.denied = true;
  const denied = await f.connect();
  assert.equal(denied.state, "failed");
  assert.match(denied.error, /read access/);
});
test("Dropbox local comparison recognizes renamed bytes and refuses a changed reviewed revision", async (t) => {
  const f = await dropboxFixture(t),
    c = await f.connect();
  const j = await f.prepare(c.id, ["id:folder"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  await fs.writeFile(path.join(local, "renamed.bin"), f.bytes);
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  const ready = await f.settle(j.id);
  assert.equal(ready.comparison.matching, 2);
  assert.equal(downloads(f).length, 0);
  f.state.one.rev = "987654321";
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /changed/);
  assert.equal(downloads(f).length, 0);
});
for (const failure of ["wrongHeader", "badBytes"])
  test(`Dropbox ${failure} refuses publication`, async (t) => {
    const f = await dropboxFixture(t),
      c = await f.connect();
    f.state[failure] = true;
    const j = await f.prepare(c.id, ["id:spare"]);
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "failed");
    assert.equal(done.files, 0);
    assert.deepEqual(await fs.readdir(path.join(done.folder, "files")), []);
  });
for (const failure of ["repeated", "unsupported", "unsafe"])
  test(`Dropbox ${failure} selection stops before file downloads`, async (t) => {
    const f = await dropboxFixture(t),
      c = await f.connect();
    if (failure === "repeated") f.state.repeated = true;
    if (failure === "unsupported") f.state.two.is_downloadable = false;
    if (failure === "unsafe") f.state.two.name = "../escape";
    const j = await f.prepare(c.id, ["id:folder"]);
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "failed");
    assert.equal(downloads(f).length, 0);
  });
test("Dropbox interrupted selected transfer restarts after reconnect with the saved revision", async (t) => {
  const f = await dropboxFixture(t, {
      bytes: Buffer.alloc(4 * 1024 * 1024 + 1, 97),
    }),
    c = await f.connect();
  f.state.slow = true;
  const j = await f.prepare(c.id, ["id:spare"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  for (let n = 0; n < 200 && !downloads(f).length; n++) await sleep(5);
  assert.equal(downloads(f).length, 1);
  await f.call("cloudPause", { id: j.id });
  assert.equal((await f.settle(j.id)).state, "paused");
  await f.restart();
  f.state.slow = false;
  const next = await f.connect();
  await f.call("cloudStart", { id: j.id, connection: next.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(downloads(f).length, 2);
  assert.deepEqual(
    await fs.readFile(path.join(done.folder, "files/unselected.txt")),
    f.bytes,
  );
});
