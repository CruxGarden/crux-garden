const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");
const shapes = [
  {
    provider: "Instagram",
    file: "your_instagram_activity/media/posts_1.json",
    make: (title = "Post") => ({
      media: [{ uri: "media/video", title, creation_timestamp: 0 }],
    }),
    id: "/0",
  },
  {
    provider: "Facebook",
    file: "posts/your_posts_1.json",
    make: (title = "Post") => ({
      attachments: [
        {
          data: [
            { media: { uri: "media/video", title, creation_timestamp: 0 } },
          ],
        },
      ],
    }),
    id: "/0/0",
  },
];
for (const shape of shapes) {
  test(`${shape.provider} streams >8MiB and >10000 posts with stable positions, separate parts and bounded preview`, async (t) => {
    const posts = Array.from({ length: 10010 }, () => ({
      ...shape.make(),
      unused: "🌿".repeat(210),
    }));
    const content = JSON.stringify(posts);
    assert.ok(Buffer.byteLength(content) > 8 * 1024 ** 2);
    const second = shape.file.replace("_1.json", "_2.json");
    const f = await photoFixture(
      t,
      {
        [shape.file]: content,
        [second]: JSON.stringify([shape.make("Second part")]),
        "media/video": "selected",
      },
      shape.provider,
    );
    const done = await f.review();
    assert.equal(done.photoReview.state, "complete", done.photoReview.error);
    const report = await f.report(done);
    assert.equal(report.counts.matched, 10011);
    assert.equal(done.photoReview.preview.length, 50);
    const first = report.records.filter((r) => r.path === shape.file);
    assert.equal(first[10009].id, `${shape.file}#10009${shape.id}`);
    assert.equal(new Set(report.records.map((r) => r.id)).size, 10011);
    assert.equal(report.records.at(-1).exportedTime.timestamp, "0");
    assert.equal(
      await fs.readFile(path.join(done.output, "files", shape.file), "utf8"),
      content,
    );
    await f.restart();
    assert.equal(
      (await f.runtime.request("list"))[0].photoReview.counts.matched,
      10011,
    );
  });
  test(`${shape.provider} rejects scripts, semicolons, late errors and changed valid bytes without partial links`, async (t) => {
    const content = JSON.stringify([shape.make()]);
    const attacks = [
      content + ";",
      content + "\nevil()",
      content.replace(/\]$/, ",]"),
      "window.data = " + content,
      "\uFEFF" + content,
    ];
    const files = { "media/video": "selected" };
    attacks.forEach(
      (v, i) => (files[shape.file.replace("_1.json", `_${i + 1}.json`)] = v),
    );
    const f = await photoFixture(t, files, shape.provider);
    let done = await f.review();
    assert.equal(done.photoReview.counts.invalid, 5);
    assert.equal(done.photoReview.counts.matched, 0);
    // Preserve file size while replacing the invalid semicolon with whitespace.
    await fs.writeFile(
      path.join(done.output, "files", shape.file),
      content + " ",
    );
    done = await f.review();
    assert.equal(done.photoReview.counts.matched, 0);
    assert.match(
      (await f.report(done)).records.find((r) => r.path === shape.file).issue,
      /fingerprint/,
    );
  });
  test(`${shape.provider} pause and API restart leave preservation intact and retry complete`, async (t) => {
    const posts = Array.from({ length: 9000 }, () => ({
      ...shape.make(),
      unused: "a".repeat(1024),
    }));
    const f = await photoFixture(
      t,
      { [shape.file]: JSON.stringify(posts), "media/video": "selected" },
      shape.provider,
    );
    await f.runtime.request("photoReview", { id: f.job.id });
    await f.runtime.request("pause", { id: f.job.id });
    const paused = await wait(f.runtime, f.job.id, true);
    assert.equal(paused.photoReview.state, "paused");
    assert.equal(paused.photoReview.report, undefined);
    assert.equal(paused.state, "verified");
    await f.restart();
    const done = await f.review();
    assert.equal(done.photoReview.counts.matched, 9000);
  });
  test(`${shape.provider} oversized entries and dense report output discard all links from the failing file`, async (t) => {
    const second = shape.file.replace("_1.json", "_2.json");
    const f = await photoFixture(
      t,
      {
        [shape.file]: JSON.stringify([
          shape.make(),
          { ...shape.make(), unused: "a".repeat(1024 ** 2) },
        ]),
        [second]: JSON.stringify(
          Array.from({ length: 4500 }, () => shape.make("x".repeat(4096))),
        ),
        "media/video": "selected",
      },
      shape.provider,
    );
    const done = await f.review(),
      report = await f.report(done);
    assert.deepEqual(report.counts, {
      matched: 0,
      ambiguous: 0,
      unmatched: 0,
      invalid: 2,
    });
    assert.ok(report.records.some((r) => /1 MiB/.test(r.issue)));
    assert.ok(report.records.some((r) => /budget/.test(r.issue)));
  });
}
test("Facebook streaming retains cumulative non-media attachment visit budget and isolates file failures", async (t) => {
  const shape = shapes[1];
  const posts = Array.from({ length: 15001 }, () => ({
    attachments: [
      { data: [{ external_context: { url: "https://never-fetch.invalid" } }] },
    ],
  }));
  posts.push(shape.make());
  const f = await photoFixture(
    t,
    {
      [shape.file]: JSON.stringify(posts),
      "posts/your_posts_2.json": JSON.stringify([shape.make()]),
      "media/video": "selected",
    },
    "Facebook",
  );
  const report = await f.report(await f.review());
  assert.equal(report.counts.invalid, 1);
  assert.equal(report.counts.matched, 1);
  assert.match(
    report.records.find((r) => r.path === shape.file).issue,
    /Too many attachment entries/,
  );
});
test("Instagram streaming enforces aggregate record limits across files rather than per-post resets", async (t) => {
  const shape = shapes[0];
  const posts = Array.from({ length: 16000 }, () => shape.make());
  const f = await photoFixture(
    t,
    {
      [shape.file]: JSON.stringify(posts),
      "your_instagram_activity/media/posts_2.json": JSON.stringify(posts),
      "media/video": "selected",
    },
    "Instagram",
  );
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 16000);
  assert.equal(report.counts.invalid, 1);
  assert.match(
    report.records.find((r) => r.status === "invalid").issue,
    /budget/,
  );
});
