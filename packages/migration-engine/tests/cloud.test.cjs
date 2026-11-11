const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { fixture, sha, sleep } = require("./cloud-fixture.cjs");
const json = (res, value) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
test("S3 selected recursive prefix uses pagination, excludes unselected files, preserves manifest and reuses fingerprints after restart", async (t) => {
  const f = await fixture(t);
  let c = await f.connect();
  const j = await f.prepare(c.id, ["folder:photos/"]);
  await assert.rejects(
    f.call("cloudCreate", { connection: c.id, selected: ["file:unlisted"] }),
    /Select listed/,
  );
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 2);
  const receipt = JSON.parse(
    await fs.readFile(path.join(done.folder, "migration-manifest.json")),
  );
  assert.equal(receipt.files.length, 2);
  assert(!JSON.stringify(receipt).includes("fixture-private-secret"));
  assert.equal(
    await fs.readFile(path.join(done.folder, "files/photos/one.jpg"), "utf8"),
    "one photo",
  );
  assert(
    !f.calls.some(
      (c) => c.op === "GetObjectCommand" && c.Key === "private.txt",
    ),
  );
  await f.restart();
  assert.deepEqual(await f.call("cloudStatus"), []);
  c = await f.connect();
  const next = await f.prepare(c.id, ["folder:photos/"]);
  const count = f.calls.filter((c) => c.op === "GetObjectCommand").length;
  await f.call("cloudStart", { id: next.id, connection: c.id });
  const reused = await f.settle(next.id);
  assert.equal(reused.state, "downloaded", reused.error);
  assert.equal(reused.reusedFiles, 2);
  assert.equal(
    f.calls.filter((c) => c.op === "GetObjectCommand").length,
    count,
  );
  const source = path.join(done.folder, "files/photos/one.jpg"),
    copy = path.join(reused.folder, "files/photos/one.jpg");
  assert.notEqual(
    (await fs.stat(source)).ino,
    (await fs.stat(copy)).ino,
    "exports must be independent copies",
  );
  const db = await fs.readFile(path.join(f.dir, "profile/migration.db"));
  assert(!db.includes(Buffer.from("fixture-private-secret")));
});
test("local directory compare matches content with different names and de-duplicates remote transfer", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const j = await f.prepare(c.id, ["folder:photos/"]);
  const local = path.join(f.dir, "already-here");
  await fs.mkdir(local);
  await fs.writeFile(
    path.join(local, "renamed.bin"),
    f.objects.get("photos/one.jpg"),
  );
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  const compared = await f.settle(j.id);
  assert.equal(compared.state, "ready", compared.error);
  assert.deepEqual(
    [compared.comparison.matching, compared.comparison.needsDownload],
    [1, 1],
  );
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 1);
  assert.deepEqual(
    f.calls.filter((c) => c.op === "GetObjectCommand").map((c) => c.Key),
    ["photos/two.jpg"],
  );
});
test("missing or modified catalog locations are downloaded again; matching names/sizes are not proof", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const j = await f.prepare(c.id, ["folder:photos/"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  await fs.writeFile(
    path.join(local, "one.jpg"),
    f.objects.get("photos/one.jpg"),
  );
  await fs.writeFile(path.join(local, "two.jpg"), Buffer.from("bad photo"));
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  assert.equal((await f.settle(j.id)).comparison.matching, 1);
  await fs.writeFile(path.join(local, "one.jpg"), "modified!");
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 0);
  assert.equal(f.calls.filter((c) => c.op === "GetObjectCommand").length, 2);
});
test("S3 object changes are refused; unfinished transfers do not overwrite existing files", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const j = await f.prepare(c.id, ["folder:photos/"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  await f.settle(j.id);
  f.versions.set("photos/one.jpg", '"v2"');
  await f.call("cloudStart", { id: j.id, connection: c.id });
  assert.equal((await f.settle(j.id)).state, "failed");
  assert(!f.calls.some((c) => c.op === "GetObjectCommand"));
});
test("S3 selection with unsafe or case-colliding paths stops before downloading", async (t) => {
  for (const names of [["../escape"], ["photo", "PHOTO"]]) {
    const f = await fixture(t, {
      objects: new Map(names.map((n) => [n, Buffer.from("x")])),
    });
    const c = await f.connect();
    const j = await f.prepare(c.id, ["folder:"]);
    await f.call("cloudStart", { id: j.id, connection: c.id });
    const done = await f.settle(j.id);
    assert.equal(done.state, "failed");
    assert.match(done.error, /unsafe or colliding/);
    assert(!f.calls.some((c) => c.op === "GetObjectCommand"));
  }
});
test("pause, quit and reconnect resume checked completed files and restart only unfinished file", async (t) => {
  const f = await fixture(t, {
    slow: true,
    objects: new Map([
      ["a", Buffer.from("done")],
      ["b", Buffer.alloc(4 * 1024 * 1024, 42)],
    ]),
  });
  let c = await f.connect();
  const j = await f.prepare(c.id, ["folder:"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  for (let n = 0; n < 300; n++) {
    if (f.calls.some((c) => c.op === "GetObjectCommand" && c.Key === "b"))
      break;
    await sleep(10);
  }
  await f.call("cloudPause", { id: j.id });
  assert.equal((await f.settle(j.id)).state, "paused");
  await f.restart();
  c = await f.connect();
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(
    f.calls.filter((c) => c.op === "GetObjectCommand" && c.Key === "a").length,
    1,
  );
  assert.equal(
    f.calls.filter((c) => c.op === "GetObjectCommand" && c.Key === "b").length,
    2,
  );
});
test("Bluesky public CAR and paginated blobs verify CIDs, with no password or private data claim", async (t) => {
  const { CID } = await import("multiformats/cid");
  const { sha256 } = await import("multiformats/hashes/sha2");
  const raw = await import("multiformats/codecs/raw");
  const media = [Buffer.from("photo one"), Buffer.from("photo two")];
  const cids = await Promise.all(
    media.map(async (b) =>
      CID.createV1(raw.code, await sha256.digest(b)).toString(),
    ),
  );
  const did = "did:plc:abcdefghijklmnopqrstuvwx";
  let bad = false;
  const f = await fixture(t, {
    http(url, req, res) {
      if (url.hostname === "public.api.bsky.app") return json(res, { did });
      if (url.hostname === "plc.directory")
        return json(res, {
          id: did,
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "https://fixture.example",
            },
          ],
        });
      if (url.pathname.endsWith("listBlobs"))
        return json(
          res,
          url.searchParams.has("cursor")
            ? { cids: [cids[1]] }
            : { cids: [cids[0]], cursor: "next" },
        );
      res.writeHead(200, {
        "content-type": url.pathname.endsWith("getRepo")
          ? "application/vnd.ipld.car"
          : "image/jpeg",
      });
      res.end(
        url.pathname.endsWith("getRepo")
          ? Buffer.from("CAR fixture")
          : bad
            ? Buffer.from("tampered")
            : media[cids.indexOf(url.searchParams.get("cid"))],
      );
    },
  });
  const c = await f.call("cloudConnect", {
    provider: "Bluesky",
    handle: "sample.example",
  });
  const j = await f.prepare(c.id, ["repository", "blobs"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 3);
  assert(done.notes.some((n) => n.includes("Private messages")));
  const imported = await f.call("cloudImport", { id: j.id });
  assert.equal(imported.provider, "Bluesky");
  // Force fresh bytes after removing one indexed location; bad CID content must fail.
  await fs.unlink(path.join(done.folder, "files/blobs", cids[0]));
  bad = true;
  const next = await f.prepare(c.id, ["blobs"]);
  await f.call("cloudStart", { id: next.id, connection: c.id });
  const failed = await f.settle(next.id);
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /checksum/);
});
test("Bluesky refuses non-HTTPS PDS endpoints before contacting them", async (t) => {
  const did = "did:plc:abcdefghijklmnopqrstuvwx";
  let contacted = false;
  const f = await fixture(t, {
    http(url, req, res) {
      if (url.hostname === "public.api.bsky.app") return json(res, { did });
      if (url.hostname === "plc.directory")
        return json(res, {
          id: did,
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "http://127.0.0.1",
            },
          ],
        });
      contacted = true;
      res.end();
    },
  });
  await assert.rejects(
    f.call("cloudConnect", { provider: "Bluesky", handle: "sample.example" }),
  );
  assert.equal(contacted, false);
});
async function googleFixture(t) {
  const bytes = Buffer.from("Drive document");
  const calls = [];
  let version = "1";
  const folder = {
    id: "folder1",
    name: "Trips",
    mimeType: "application/vnd.google-apps.folder",
    version: "1",
  };
  const doc = {
    id: "doc1",
    name: "Notes",
    mimeType: "application/vnd.google-apps.document",
    version: "1",
    capabilities: { canDownload: true },
  };
  const file = {
    id: "file1",
    name: "photo.jpg",
    mimeType: "image/jpeg",
    version: "1",
    size: String(bytes.length),
    md5Checksum: createHash("md5").update(bytes).digest("hex"),
    capabilities: { canDownload: true },
  };
  const f = await fixture(t, {
    tokenExchange: async (args) => {
      calls.push({ token: args });
      return {
        access_token: "fixture-google-access",
        refresh_token: "fixture-google-refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/drive.readonly",
      };
    },
    http(url, req, res) {
      calls.push({ url: url.href, authorization: req.headers.authorization });
      if (url.pathname.endsWith("/about"))
        return json(res, {
          user: { displayName: "Fixture", permissionId: "fixture-user" },
        });
      if (url.pathname === "/drive/v3/files") {
        if (url.searchParams.get("q").includes("'root'"))
          return json(res, { files: [folder] });
        return json(
          res,
          url.searchParams.has("pageToken")
            ? { files: [file] }
            : { files: [doc], nextPageToken: "next" },
        );
      }
      if (
        url.pathname.endsWith("/export") ||
        url.searchParams.get("alt") === "media"
      ) {
        res.writeHead(200, { "content-length": bytes.length });
        return res.end(bytes);
      }
      const v = url.pathname.endsWith("folder1")
        ? folder
        : url.pathname.endsWith("doc1")
          ? doc
          : file;
      return json(res, { ...v, version });
    },
  });
  const auth = await f.call("cloudAuthorize", {
    provider: "Google Drive",
    clientId: "fixture.apps.googleusercontent.com",
    clientSecret: "fixture-client-secret",
  });
  const url = new URL(auth.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const callback = new URL(url.searchParams.get("redirect_uri"));
  callback.search = new URLSearchParams({
    code: "fixture-code",
    state: "wrong",
  });
  assert.equal((await fetch(callback)).status, 400);
  assert.equal(calls.length, 0);
  callback.search = new URLSearchParams({
    code: "fixture-code",
    state: url.searchParams.get("state"),
  });
  assert.equal((await fetch(callback)).status, 200);
  const c = (await f.call("cloudStatus"))[0];
  assert.equal(c.state, "connected", c.error);
  return {
    ...f,
    c,
    calls,
    change() {
      version = "2";
    },
  };
}
test("Google PKCE callback, paginated selected folder and native document export preserve identities without credentials", async (t) => {
  const f = await googleFixture(t);
  const j = await f.prepare(f.c.id, ["folder1"]);
  await f.call("cloudStart", { id: j.id, connection: f.c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.files, 2);
  const manifest = JSON.parse(
    await fs.readFile(path.join(done.folder, "migration-manifest.json")),
  );
  assert(manifest.files.some((v) => v.path.endsWith(".docx")));
  assert(f.calls.some((v) => v.url?.includes("pageToken=next")));
  assert(!JSON.stringify(manifest).includes("fixture-google"));
  const data = await fs.readFile(path.join(f.dir, "profile/migration.db"));
  for (const secret of [
    "fixture-client-secret",
    "fixture-google-access",
    "fixture-google-refresh",
  ])
    assert(!data.includes(Buffer.from(secret)));
});
test("Google planned file version changes prevent downloading mixed versions", async (t) => {
  const f = await googleFixture(t);
  const j = await f.prepare(f.c.id, ["folder1"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: f.c.id,
    path: local,
  });
  assert.equal((await f.settle(j.id)).state, "ready");
  f.change();
  await f.call("cloudStart", { id: j.id, connection: f.c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "failed");
  assert.match(done.error, /changed/);
});

test("identical content at different remote keys downloads once while exports keep independent files", async (t) => {
  const bytes = Buffer.from("same content");
  const f = await fixture(t, {
    objects: new Map([
      ["a.txt", bytes],
      ["renamed.txt", bytes],
    ]),
  });
  const c = await f.connect();
  const j = await f.prepare(c.id, ["folder:"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const done = await f.settle(j.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 1);
  assert.equal(f.calls.filter((c) => c.op === "GetObjectCommand").length, 1);
  assert.notEqual(
    (await fs.stat(path.join(done.folder, "files/a.txt"))).ino,
    (await fs.stat(path.join(done.folder, "files/renamed.txt"))).ino,
  );
});
test("ordinary preservation also registers fingerprints for subsequent cloud reuse", async (t) => {
  const f = await fixture(t, {
    objects: new Map([["a.txt", Buffer.from("already preserved")]]),
  });
  const source = path.join(f.dir, "source");
  const dest = path.join(f.dir, "preserved");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  await fs.writeFile(path.join(source, "local.txt"), "already preserved");
  const j = await f.call("create", { provider: "Dropbox" });
  await f.call("source", { id: j.id, path: source });
  await f.call("destination", { id: j.id, path: dest });
  await f.call("inspect", { id: j.id });
  async function settleImport() {
    for (let n = 0; n < 500; n++) {
      const v = (await f.call("list"))[0];
      if (!["running", "inspecting"].includes(v.state)) return v;
      await sleep(10);
    }
    throw Error("import timeout");
  }
  assert.equal((await settleImport()).state, "ready");
  await f.call("start", { id: j.id });
  assert.equal((await settleImport()).state, "verified");
  const c = await f.connect();
  const remote = await f.prepare(c.id, ["folder:"]);
  await f.call("cloudStart", { id: remote.id, connection: c.id });
  const done = await f.settle(remote.id);
  assert.equal(done.state, "downloaded", done.error);
  assert.equal(done.reusedFiles, 1);
  assert.equal(f.calls.filter((c) => c.op === "GetObjectCommand").length, 0);
});
test("new cloud API routes retain authentication, reject arbitrary sources and redact provider errors", async (t) => {
  const { startLocalApi } = require("../dist/http.cjs");
  const f = await fixture(t, { fail: () => true });
  const api = await startLocalApi(f.runtime());
  t.after(() => api.close());
  assert.equal((await fetch(api.url + "/v1/cloud/jobs")).status, 403);
  const headers = {
    Authorization: "Bearer " + api.token,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(api.url + "/v1/cloud/jobs", {
        headers: { ...headers, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const c = await f.connect();
  await assert.rejects(
    f.call("cloudBrowse", { connection: c.id, parent: "folder:unlisted" }),
    /listed folder/,
  );
  const j = await f.prepare(c.id, ["folder:photos/"]);
  await f.call("cloudStart", { id: j.id, connection: c.id });
  const failed = await f.settle(j.id);
  assert.equal(failed.state, "failed");
  assert(!JSON.stringify(failed).includes("fixture-private-secret"));
  const result = await (
    await fetch(api.url + "/v1/cloud/jobs", { headers })
  ).json();
  assert(!JSON.stringify(result).includes("fixture-private-secret"));
  assert.equal(result.result[0].state, "failed");
});
test("local scan refuses symlinks", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const j = await f.prepare(c.id, ["folder:photos/"]);
  const local = path.join(f.dir, "local");
  await fs.mkdir(local);
  await fs.symlink("/etc/hosts", path.join(local, "linked"));
  await f.call("cloudScanDirectory", {
    id: j.id,
    connection: c.id,
    path: local,
  });
  assert.equal((await f.settle(j.id)).state, "failed");
  assert.equal(f.calls.filter((c) => c.op === "GetObjectCommand").length, 0);
});
