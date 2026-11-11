const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { gmailFixture } = require("./gmail-fixture.cjs");
async function run(f, connection, selected = ["label:Label_1"]) {
  const job = await f.prepare(connection, selected);
  await f.call("cloudStart", { id: job.id, connection });
  return f.settle(job.id);
}
async function manifest(job) {
  return JSON.parse(
    await fs.readFile(path.join(job.folder, "migration-manifest.json"), "utf8"),
  );
}
test("Gmail PKCE requests only readonly scope, rejects bad state and never persists credentials", async (t) => {
  const f = await gmailFixture(t);
  await assert.rejects(
    f.call("cloudConnect", { provider: "Gmail" }),
    /authorize/,
  );
  const auth = await f.call("cloudAuthorize", {
    provider: "Gmail",
    clientId: "fixture.apps.googleusercontent.com",
    clientSecret: "gmail-desktop-secret",
  });
  const url = new URL(auth.authorizationUrl);
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/gmail.readonly",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const callback = new URL(url.searchParams.get("redirect_uri"));
  callback.search = "code=bad&state=bad";
  assert.equal((await fetch(callback)).status, 400);
  assert.equal(f.calls.length, 0);
  const c = await f.complete(auth);
  assert.equal(c.state, "connected");
  const done = await run(f, c.id);
  assert.equal(done.state, "downloaded", done.error);
  const r = await manifest(done);
  const serialized = JSON.stringify(r);
  for (const secret of [
    "gmail-access-secret",
    "gmail-refresh-secret",
    "gmail-desktop-secret",
    "fixture-code",
  ])
    assert.ok(!serialized.includes(secret));
  for (const name of (await fs.readdir(path.join(f.dir, "profile"))).filter(
    (n) => n.startsWith("migration.db"),
  )) {
    const db = await fs.readFile(path.join(f.dir, "profile", name));
    for (const secret of [
      "gmail-access-secret",
      "gmail-refresh-secret",
      "gmail-desktop-secret",
      "fixture-code",
    ])
      assert.ok(!db.includes(Buffer.from(secret)));
  }
  const token = f.calls.find((c) => c.token).token;
  assert.equal(
    crypto.createHash("sha256").update(token.code_verifier).digest("base64url"),
    url.searchParams.get("code_challenge"),
  );
});
test("selected Gmail labels form a union with raw bytes and separate ID/date/label metadata", async (t) => {
  const f = await gmailFixture(t);
  const c = await f.connect();
  const root = await f.call("cloudBrowse", { connection: c.id });
  assert.equal(root.entries[0].name, "All messages, including Spam and Trash");
  const first = await f.call("cloudBrowse", {
    connection: c.id,
    parent: "label:Label_1",
  });
  assert.match(first.entries[0].name, /First <img/);
  assert.equal(first.entries[0].size, undefined);
  const second = await f.call("cloudBrowse", {
    connection: c.id,
    parent: "label:Label_1",
    cursor: first.cursor,
  });
  assert.equal(second.entries[0].id, "message:bb");
  const done = await run(f, c.id, [
    "label:Label_1",
    "label:INBOX",
    "message:aa",
  ]);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 2);
  const r = await manifest(done);
  assert.deepEqual(
    r.files.map((f) => f.id),
    ["aa", "bb"],
  );
  assert.equal(r.files[0].metadata.internalDate, "0");
  assert.equal(
    r.files[0].metadata.labels.find((l) => l.id === "Label_1").name,
    "Family",
  );
  assert.equal(r.files[0].reusePolicy, "checksum-only");
  for (const item of r.files) {
    assert.deepEqual(
      await fs.readFile(path.join(done.folder, "files", item.path)),
      f.data.get(item.id),
    );
    assert.equal(
      item.completed.sha256,
      crypto.createHash("sha256").update(f.data.get(item.id)).digest("hex"),
    );
  }
  assert.equal(f.calls.filter((c) => c.query?.format === "raw").length, 2);
  assert.ok(
    f.calls
      .filter((c) => c.path?.endsWith("/messages"))
      .every((c) => c.query.includeSpamTrash === "true"),
  );
});
test("explicit individual message selection excludes other messages and all group includes Spam", async (t) => {
  const f = await gmailFixture(t);
  const c = await f.connect();
  await f.call("cloudBrowse", { connection: c.id });
  await f.call("cloudBrowse", { connection: c.id, parent: "label:INBOX" });
  const selected = await run(f, c.id, ["message:aa"]);
  assert.equal(selected.files, 1);
  const all = await run(f, c.id, ["all"]);
  assert.equal(all.files, 3);
  assert.equal(
    (await manifest(all)).files.some((v) => v.id === "cc"),
    true,
  );
});
test("Gmail missing/changed metadata and invalid raw base64 fail without publishing a final file", async (t) => {
  for (const state of [
    { missingDate: true },
    { rawOverride: "!!!" },
    { rawOverride: "Zh" },
    { rawOverride: "YQ=" },
    { changeDuringRaw: true },
  ]) {
    const f = await gmailFixture(t, { state });
    const c = await f.connect();
    const done = await run(f, c.id, ["label:INBOX"]);
    assert.equal(done.state, "failed");
    assert.equal(done.files, 0);
    await assert.rejects(
      fs.access(path.join(done.folder, "files/messages/aa.eml")),
    );
  }
});
test("Gmail refuses changed planned revisions, repeated cursors and insufficient scopes", async (t) => {
  const f = await gmailFixture(t);
  const c = await f.connect();
  const job = await f.prepare(c.id, ["label:INBOX"]);
  await f.call("cloudScanDirectory", {
    id: job.id,
    connection: c.id,
    path: f.dir,
  });
  const scanned = await f.settle(job.id);
  assert.equal(scanned.comparison.uncertain, 1);
  f.state.history = "12";
  await f.call("cloudStart", { id: job.id, connection: c.id });
  assert.match((await f.settle(job.id)).error, /changed/);
  const repeat = await gmailFixture(t, { state: { repeatCursor: true } });
  const rc = await repeat.connect();
  assert.match((await run(repeat, rc.id, ["all"])).error, /repeated/);
  const denied = await gmailFixture(t, {
    scope: "https://www.googleapis.com/auth/drive.readonly",
  });
  const dc = await denied.connect();
  assert.equal(dc.state, "failed");
  assert.match(dc.error, /read access/);
});
test("Gmail refresh uses shared bounded token transport and recovery rehashes completed files", async (t) => {
  const f = await gmailFixture(t, { expired: true, state: { failId: "bb" } });
  const c = await f.connect();
  assert.ok(f.calls.some((c) => c.token?.grant_type === "refresh_token"));
  // Fail only raw retrieval for the second message after discovery has completed.
  f.state.failId = null;
  const job = await f.prepare(c.id, ["label:Label_1"]);
  await f.call("cloudScanDirectory", {
    id: job.id,
    connection: c.id,
    path: f.dir,
  });
  await f.settle(job.id);
  f.state.failId = "bb";
  await f.call("cloudStart", { id: job.id, connection: c.id });
  const failed = await f.settle(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.files, 1);
  await f.restart();
  f.state.failId = null;
  const reconnect = await f.connect();
  await f.call("cloudStart", { id: job.id, connection: reconnect.id });
  const done = await f.settle(job.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 2);
  assert.equal(
    f.calls.filter((c) => c.query?.format === "raw" && c.path.endsWith("/aa"))
      .length,
    1,
  );
  const next = await run(f, reconnect.id, ["label:INBOX"]);
  assert.equal(next.reusedFiles, 0);
  assert.equal(
    f.calls.filter((c) => c.query?.format === "raw" && c.path.endsWith("/aa"))
      .length,
    2,
  );
});
test("Gmail reconnect refuses changed source address and changed label-name snapshots", async (t) => {
  const f = await gmailFixture(t);
  const c = await f.connect();
  const job = await f.prepare(c.id, ["label:INBOX"]);
  await f.call("cloudScanDirectory", {
    id: job.id,
    connection: c.id,
    path: f.dir,
  });
  await f.settle(job.id);
  await f.restart();
  f.state.email = "other@example.test";
  let next = await f.connect();
  await assert.rejects(
    f.call("cloudStart", { id: job.id, connection: next.id }),
    /same source/,
  );
  f.state.email = "mailbox@example.test";
  f.state.labelName = "Renamed";
  next = await f.connect();
  await f.call("cloudStart", { id: job.id, connection: next.id });
  assert.match((await f.settle(job.id)).error, /changed/);
});

test("Gmail RAW accepts larger message payloads than metadata and enforces its declared response bound", async (t) => {
  const f = await gmailFixture(t);
  f.data.set(
    "aa",
    Buffer.concat([
      Buffer.from("Subject: Large fixture\n\n"),
      Buffer.alloc(7 * 1024 * 1024, 120),
    ]),
  );
  const c = await f.connect();
  const done = await run(f, c.id, ["label:INBOX"]);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.bytes, f.data.get("aa").length);
  const bounded = await gmailFixture(t, { state: { oversizedResponse: true } });
  const bc = await bounded.connect();
  const failed = await run(bounded, bc.id, ["label:INBOX"]);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /too much metadata/);
  assert.equal(failed.files, 0);
});
test("completed Gmail copies changed on disk are refused on recovery without overwriting them", async (t) => {
  const f = await gmailFixture(t);
  const c = await f.connect();
  const job = await f.prepare(c.id, ["label:Label_1"]);
  await f.call("cloudScanDirectory", {
    id: job.id,
    connection: c.id,
    path: f.dir,
  });
  await f.settle(job.id);
  f.state.failId = "bb";
  await f.call("cloudStart", { id: job.id, connection: c.id });
  const failed = await f.settle(job.id);
  assert.equal(failed.files, 1);
  const saved = path.join(failed.folder, "files/messages/aa.eml");
  await fs.writeFile(saved, "user-changed");
  await f.restart();
  f.state.failId = null;
  const again = await f.connect();
  await f.call("cloudStart", { id: job.id, connection: again.id });
  const stopped = await f.settle(job.id);
  assert.equal(stopped.state, "failed");
  assert.equal(await fs.readFile(saved, "utf8"), "user-changed");
});
