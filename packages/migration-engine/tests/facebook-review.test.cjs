const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");
const { entries, metadataPath, post } = require("./facebook-fixture.cjs");
const zip = require("./zip-fixture.cjs");
const fixture = (t, files = entries) => photoFixture(t, files, "Facebook");
test("Facebook references preserve extensionless files, raw dates, unknown schemas and restart", async (t) => {
  const f = await fixture(t);
  const done = await f.review();
  assert.equal(done.photoReview.state, "complete", done.photoReview.error);
  assert.deepEqual(done.photoReview.counts, {
    matched: 1,
    ambiguous: 0,
    unmatched: 1,
    invalid: 1,
  });
  const report = await f.report(done);
  assert.equal(report.records[0].kind, "media-reference");
  assert.equal(report.records[0].exportedTime.timestamp, "0");
  assert.equal(report.records[0].dateTaken, undefined);
  assert.equal(report.uninterpretedFiles.length, 1);
  for (const [name, bytes] of Object.entries(entries))
    assert.equal(
      await fs.readFile(path.join(done.output, "files", name), "utf8"),
      bytes,
    );
  await f.restart();
  assert.deepEqual(
    (await f.runtime.request("list"))[0].photoReview,
    JSON.parse(JSON.stringify(done.photoReview)),
  );
});
test("Facebook rejects traversal, URLs, escaped paths and wrong roots without basename guessing", async (t) => {
  const unsafe = [
    "../outside",
    "/etc/passwd",
    "file:///tmp/test",
    "https://invalid.test/x",
    "media\\video",
    "media/%2e%2e/video",
    "media//video",
    "media/./video",
    "media/video?x",
    "media/video#x",
    "media/\u0000video",
  ];
  const f = await fixture(t, {
    [metadataPath]: JSON.stringify([
      post([...unsafe.map((uri) => ({ uri })), { uri: "media/video" }]),
    ]),
    "different/media/video": "not in this root",
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, unsafe.length);
  assert.equal(done.photoReview.counts.unmatched, 1);
  assert.equal(done.photoReview.counts.matched, 0);
});
test("Facebook wrappers are scoped, duplicate references are not content deduplication", async (t) => {
  const f = await fixture(t, {
    ["account/" + metadataPath]: JSON.stringify([
      post([{ uri: "media/video" }, { uri: "media/video" }]),
    ]),
    "account/media/video": "owned",
    "other/media/video": "other",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 2);
  assert.equal(report.mediaFiles.length, 1);
  assert.deepEqual(report.records[0].candidates, ["account/media/video"]);
});
test("Facebook malformed and oversized lists stay visible; changed sidecars cannot produce matches", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: JSON.stringify([
      { attachments: {} },
      null,
      { label_values: [] },
    ]),
    "posts/your_posts_2.json": JSON.stringify(Array(100001).fill(null)),
    "posts/your_posts_3.json": "{broken",
  });
  let done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 5);
  await fs.writeFile(path.join(done.output, "files", metadataPath), "[]");
  done = await f.review();
  assert.match((await f.report(done)).records[0].issue, /differs/);
});
test("Facebook split parts use selected receipt paths and leave repeated files ambiguous", async (t) => {
  const f = await fixture(t);
  const paths = [];
  const parts = path.join(f.root, "parts");
  await fs.mkdir(parts);
  for (const [name, items] of [
    ["meta.zip", [{ name: metadataPath, data: entries[metadataPath] }]],
    ["one.zip", [{ name: "photos_and_videos/your_posts/video", data: "one" }]],
    ["two.zip", [{ name: "photos_and_videos/your_posts/video", data: "two" }]],
  ]) {
    const file = path.join(parts, name);
    await fs.writeFile(file, zip(items));
    paths.push(file);
  }
  async function preserve(selected) {
    const j = await f.runtime.request("create", { provider: "Facebook" });
    await f.runtime.request("archiveSet", { id: j.id, paths: selected });
    await f.runtime.request("destination", { id: j.id, path: f.destination });
    await f.runtime.request("inspect", { id: j.id });
    await wait(f.runtime, j.id);
    await f.runtime.request("start", { id: j.id });
    const done = await wait(f.runtime, j.id);
    assert.equal(done.state, "verified", done.error);
    await f.runtime.request("photoReview", { id: j.id });
    return wait(f.runtime, j.id, true);
  }
  assert.equal(
    (await preserve(paths.slice(0, 2))).photoReview.counts.matched,
    1,
  );
  const all = await preserve(paths);
  assert.equal(all.photoReview.counts.ambiguous, 1);
  assert.equal((await f.report(all)).records[0].candidates.length, 2);
});

test("Facebook text-only and link attachments stay preserved without missing-file claims", async (t) => {
  const files = {
    [metadataPath]: JSON.stringify([
      { title: "Text only", timestamp: 1 },
      { attachments: [] },
      {
        attachments: [
          {
            data: [
              { external_context: { url: "https://never-fetch.invalid/link" } },
            ],
          },
        ],
      },
    ]),
  };
  const f = await fixture(t, files);
  const done = await f.review();
  assert.deepEqual(done.photoReview.counts, {
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    invalid: 0,
  });
  assert.equal(
    await fs.readFile(path.join(done.output, "files", metadataPath), "utf8"),
    files[metadataPath],
  );
});
test("Facebook attachment fanout is bounded before allocating derived records", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: JSON.stringify([
      {
        attachments: [{ data: Array(30001).fill({}) }],
      },
    ]),
    "media/video": "keep",
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 1);
  const report = await f.report(done);
  assert.match(report.records[0].issue, /Too many attachment entries/);
  assert.equal(report.mediaFiles.length, 0);
});
