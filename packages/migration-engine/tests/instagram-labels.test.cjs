const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");
const {
  labeledPath: file,
  labeledEntries,
  entries,
  metadataPath,
} = require("./instagram-fixture.cjs");
const post = (uri = "media/video") => ({
  media: [],
  label_values: [{ label: "Media", media: [{ uri }] }],
});
const fixture = (t, files) => photoFixture(t, files, "Instagram");
test("Instagram labeled media preserves raw evidence without parent date or cross-format identity inference", async (t) => {
  const f = await fixture(t, { ...entries, ...labeledEntries });
  const done = await f.review(),
    report = await f.report(done);
  assert.equal(report.counts.matched, 2);
  const modern = report.records.filter((r) => r.path === file);
  assert.equal(modern[0].id, `${file}#0/label/1/0`);
  assert.equal(modern[0].exportedTime.timestamp, "0");
  assert.equal(modern[1].exportedTime, undefined);
  assert.equal(
    new Set(
      report.records
        .filter((r) => r.kind === "media-reference")
        .map((r) => r.id),
    ).size,
    6,
  );
  assert.equal(report.mediaFiles.length, 1);
  for (const [name, bytes] of Object.entries({ ...entries, ...labeledEntries }))
    assert.equal(
      await fs.readFile(path.join(done.output, "files", name), "utf8"),
      bytes,
    );
  await f.restart();
  assert.deepEqual(
    (await f.runtime.request("list"))[0].photoReview.counts,
    done.photoReview.counts,
  );
});
test("Instagram exact Media labels keep repeated references distinct, localized or nested shapes visible", async (t) => {
  const f = await fixture(t, {
    [file]: JSON.stringify([
      {
        timestamp: 123,
        title: "Unqualified caption",
        label_values: [
          ...post().label_values,
          ...post().label_values,
          { label: "Médias", media: [{ uri: "media/video" }] },
          { label: "Media", value: { media: [{ uri: "media/video" }] } },
          { label: "Caption", value: "Not interpreted" },
          null,
        ],
        media: [{ uri: "media/video" }],
      },
    ]),
    "media/video": "selected",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 2);
  assert.equal(report.counts.invalid, 4);
  assert.deepEqual(
    report.records.filter((r) => r.status === "matched").map((r) => r.id),
    [`${file}#0/label/0/0`, `${file}#0/label/1/0`],
  );
  for (const r of report.records) {
    assert.equal(r.exportedTime, undefined);
    assert.equal(r.title, undefined);
  }
});
test("Instagram label references reject URLs and wrong roots, retain same-root ambiguity across selected parts", async (t) => {
  const zip = require("./zip-fixture.cjs");
  const f = await fixture(t, {});
  const parts = [];
  const partDir = path.join(f.root, "parts");
  await fs.mkdir(partDir);
  for (const [name, items] of [
    [
      "meta",
      [
        {
          name: "wrapper/" + file,
          data: JSON.stringify([
            post(),
            post("../video"),
            post("https://never-fetch.invalid/video"),
            post("media/absent"),
          ]),
        },
      ],
    ],
    ["one", [{ name: "wrapper/media/video", data: "one" }]],
    ["two", [{ name: "wrapper/media/video", data: "two" }]],
    ["other", [{ name: "other/media/absent", data: "wrong root" }]],
  ]) {
    const target = path.join(partDir, name + ".zip");
    await fs.writeFile(target, zip(items));
    parts.push(target);
  }
  const job = await f.runtime.request("create", { provider: "Instagram" });
  await f.runtime.request("archiveSet", { id: job.id, paths: parts });
  await f.runtime.request("destination", { id: job.id, path: f.destination });
  await f.runtime.request("inspect", { id: job.id });
  await wait(f.runtime, job.id);
  await f.runtime.request("start", { id: job.id });
  assert.equal((await wait(f.runtime, job.id)).state, "verified");
  await f.runtime.request("photoReview", { id: job.id });
  const done = await wait(f.runtime, job.id, true);
  assert.deepEqual(done.photoReview.counts, {
    matched: 0,
    ambiguous: 1,
    unmatched: 1,
    invalid: 2,
  });
});
test("Instagram labeled streaming counts ignored labels cumulatively and discards prior same-file matches", async (t) => {
  const posts = [
    post(),
    ...Array.from({ length: 15000 }, () => ({
      label_values: [{ label: "Caption" }, { label: "Time" }],
    })),
  ];
  const f = await fixture(t, {
    [file]: JSON.stringify(posts),
    [metadataPath]: JSON.stringify([{ media: [{ uri: "media/video" }] }]),
    "media/video": "selected",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 1);
  assert.equal(report.counts.invalid, 1);
  assert.match(
    report.records.find((r) => r.path === file).issue,
    /Too many label entries/,
  );
});
test("Instagram labeled syntax and receipt failures never retain provisional associations", async (t) => {
  const content = JSON.stringify([post()]);
  const f = await fixture(t, {
    [file]: content + ";",
    "media/video": "selected",
  });
  let report = await f.report(await f.review());
  assert.equal(report.counts.matched, 0);
  assert.equal(report.counts.invalid, 1);
  const done = (await f.runtime.request("list"))[0];
  await fs.writeFile(path.join(done.output, "files", file), content + " ");
  report = await f.report(await f.review());
  assert.equal(report.counts.matched, 0);
  assert.match(report.records[0].issue, /fingerprint/);
});
test("Instagram labeled >8MiB streaming supports pause and restart with stable positions and bounded preview", async (t) => {
  const posts = Array.from({ length: 10010 }, () => ({
    ...post(),
    unused: "🌿".repeat(210),
  }));
  const content = JSON.stringify(posts);
  assert.ok(Buffer.byteLength(content) > 8 * 1024 ** 2);
  const f = await fixture(t, { [file]: content, "media/video": "selected" });
  await f.runtime.request("photoReview", { id: f.job.id });
  await f.runtime.request("pause", { id: f.job.id });
  assert.equal(
    (await wait(f.runtime, f.job.id, true)).photoReview.state,
    "paused",
  );
  await f.restart();
  const done = await f.review(),
    report = await f.report(done);
  assert.equal(report.counts.matched, 10010);
  assert.equal(done.photoReview.preview.length, 50);
  assert.equal(report.records.at(-1).id, `${file}#10009/label/0/0`);
  assert.equal(
    await fs.readFile(path.join(done.output, "files", file), "utf8"),
    content,
  );
});
