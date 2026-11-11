const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");

test("Flickr review associates selected preserved IDs, exposes missing/ambiguous records and preserves originals", async (t) => {
  const f = await photoFixture(t);
  const before = await fs.readFile(path.join(f.job.output, "report.json"));
  const done = await f.review();
  assert.equal(done.state, "verified");
  assert.equal(done.photoReview.state, "complete", done.photoReview.error);
  assert.deepEqual(done.photoReview.counts, {
    matched: 1,
    ambiguous: 1,
    unmatched: 2,
    invalid: 1,
  });
  const report = await f.report(done);
  assert.equal(report.unassociatedMedia.length, 1);
  assert.equal(report.uninterpretedFiles.length, 2);
  const photo = report.records.find((r) => r.id === "101");
  assert.deepEqual(photo.candidates, ["part-a/101_abcdef_o.jpg"]);
  assert.equal(photo.dateTaken, "2020-07-01 12:30:00");
  assert.equal(
    report.records.find((r) => r.id === "901").members[1].candidates.length,
    0,
  );
  assert.equal(report.receiptSha256.length, 64);
  assert.deepEqual(
    await fs.readFile(path.join(f.job.output, "report.json")),
    before,
  );
  assert.deepEqual(
    await fs.readFile(path.join(f.job.output, "files/metadata/photo_101.json")),
    await fs.readFile(path.join(f.source, "metadata/photo_101.json")),
  );
  await f.restart();
  assert.deepEqual(
    (await f.runtime.request("list"))[0].photoReview,
    JSON.parse(JSON.stringify(done.photoReview)),
  );
  const again = await f.review();
  assert.notEqual(again.photoReview.report, done.photoReview.report);
  assert.deepEqual((await f.report(again)).records, report.records);
});

test("review detects changed, invalid JSON and linked sidecars without following links", async (t) => {
  const f = await photoFixture(t, {
    "photo_1.json": '{"id":"1"}',
    "photo_2.json": "{broken",
    "photo_3.json": '{"id":"3"}',
    "1_a_o.jpg": "one",
  });
  await fs.writeFile(
    path.join(f.job.output, "files/photo_1.json"),
    '{"id":"9"}',
  );
  await fs.unlink(path.join(f.job.output, "files/photo_3.json"));
  await fs.symlink(
    path.join(f.source, "photo_3.json"),
    path.join(f.job.output, "files/photo_3.json"),
  );
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 3);
  const report = await f.report(done);
  assert.match(report.records[0].issue, /differs/);
  assert.equal(report.records[1].issue, "Invalid JSON.");
  assert.match(report.records[2].issue, /regular file/);
});

test("duplicate sidecars stay ambiguous and imported paths cannot escape the receipt root", async (t) => {
  const f = await photoFixture(t, {
    "a/photo_1.json": '{"id":"1"}',
    "b/photo_1.json": '{"id":"1"}',
    "1_a_o.jpg": "one",
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.ambiguous, 2);
  const receiptPath = path.join(done.output, "report.json");
  const receipt = JSON.parse(await fs.readFile(receiptPath));
  receipt.files[0].path = "../outside.json";
  await fs.writeFile(receiptPath, JSON.stringify(receipt));
  const failed = await f.review();
  assert.equal(failed.photoReview.state, "failed");
  assert.match(failed.photoReview.error, /safely preserved/);
});

test("large sidecars remain preserved and are reported as unreadable; empty review is explicit", async (t) => {
  const f = await photoFixture(t, {
    "photo_1.json": " ".repeat(8 * 1024 ** 2 + 1),
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 1);
  assert.match((await f.report(done)).records[0].issue, /limit/);
  const empty = await photoFixture(t, { "photo.jpg": "no metadata" });
  const reviewed = await empty.review();
  assert.equal(reviewed.photoReview.total, 0);
  assert.equal((await empty.report(reviewed)).uninterpretedFiles.length, 1);
});

test("metadata review is background work, pauseable, guarded and does not change preservation state", async (t) => {
  const entries = {};
  for (let i = 0; i < 200; i++)
    entries[`photo_${i}.json`] = JSON.stringify({ id: String(i) });
  const f = await photoFixture(t, entries);
  await f.runtime.request("photoReview", { id: f.job.id });
  await assert.rejects(
    f.runtime.request("photoReview", { id: f.job.id }),
    /Pause/,
  );
  await assert.rejects(
    f.runtime.request("start", { id: f.job.id }),
    /current import/,
  );
  await f.runtime.request("pause", { id: f.job.id });
  const paused = await wait(f.runtime, f.job.id, true);
  assert.equal(paused.photoReview.state, "paused");
  assert.equal(paused.state, "verified");
  assert.equal((await f.review()).photoReview.state, "complete");
  const unready = await f.runtime.request("create", { provider: "Flickr" });
  await assert.rejects(
    f.runtime.request("photoReview", { id: unready.id }),
    /Preserve and verify/,
  );
});

test("title-ID filenames match, numeric filename collisions remain ambiguous", async (t) => {
  const f = await photoFixture(t, {
    "photo_11.json": '{"id":"11"}',
    "photo_12.json": '{"id":"12"}',
    "photo_13.json": '{"id":"13"}',
    "summer_at_the_lake_11_o.jpg": "eleven",
    "12_13_o.jpg": "two possible IDs",
  });
  const done = await f.review();
  assert.deepEqual(done.photoReview.counts, {
    matched: 1,
    ambiguous: 2,
    unmatched: 0,
    invalid: 0,
  });
  const report = await f.report(done);
  assert.equal(
    report.records.find((r) => r.id === "11").candidates[0],
    "summer_at_the_lake_11_o.jpg",
  );
  assert.match(
    report.records.find((r) => r.id === "12").issue,
    /more than one/,
  );
});

test("authenticated local API starts the same bounded job-owned review", async (t) => {
  const f = await photoFixture(t);
  const { startLocalApi } = require("../dist/http.cjs");
  const api = await startLocalApi(f.runtime);
  t.after(() => api.close());
  const url = `${api.url}/v1/jobs/${f.job.id}/photoReview`;
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${api.token}`,
    },
    body: "{}",
  });
  assert.equal(response.status, 200, await response.text());
  assert.equal(
    (await wait(f.runtime, f.job.id, true)).photoReview.state,
    "complete",
  );
});
