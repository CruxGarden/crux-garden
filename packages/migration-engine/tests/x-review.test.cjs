const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");
const {
  entries,
  metadataPath,
  wrap,
  tweet,
  photo,
} = require("./x-fixture.cjs");
const zip = require("./zip-fixture.cjs");
const fixture = (t, files = entries) => photoFixture(t, files, "X");
test("X inert archive review keeps exact string IDs, originals, unsupported resources and restart", async (t) => {
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
  assert.equal(
    report.records[0].candidates[0],
    "data/tweets_media/9007199254740993123-Photo.jpg",
  );
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
test("X wrappers require exact family and part; leading/trailing executable text is never executed", async (t) => {
  const f = await fixture(t);
  const marker = path.join(f.root, "must-not-exist");
  const attack = `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`;
  const bad = [
    `${attack};${wrap([])}`,
    `${wrap([])}${attack}`,
    "window.YTD.tweets.part0 = (()=>[])()",
    wrap([], 1),
    wrap([], 0, "tweet"),
    "[]",
    "window['YTD'].tweets.part0 = []",
    wrap([]) + ";",
    "window.YTD.tweets.part0 = [] /* comment */",
  ];
  for (const [index, content] of bad.entries()) {
    const dir = path.join(f.source, String(index));
    await fs.mkdir(path.join(dir, "data"), { recursive: true });
    await fs.writeFile(path.join(dir, metadataPath), content);
  }
  const j = await f.runtime.request("create", { provider: "X" });
  await f.runtime.request("source", { id: j.id, path: f.source });
  await f.runtime.request("destination", { id: j.id, path: f.destination });
  await f.runtime.request("inspect", { id: j.id });
  await wait(f.runtime, j.id);
  await f.runtime.request("start", { id: j.id });
  await wait(f.runtime, j.id);
  await f.runtime.request("photoReview", { id: j.id });
  const done = await wait(f.runtime, j.id, true);
  assert.equal(done.photoReview.state, "complete");
  assert.equal(done.photoReview.counts.invalid, bad.length + 1); // original fixture's unsupported video
  await assert.rejects(fs.stat(marker), { code: "ENOENT" });
});
test("X part files and older singular family stay scoped to their exact archive folders", async (t) => {
  const f = await fixture(t, {
    "one/data/tweets-part1.js":
      "\uFEFF \n" + wrap([tweet([photo()])], 1) + "\n",
    "one/data/tweets_media/9007199254740993123-Photo.jpg": "one",
    "two/data/tweet.js": wrap([tweet([photo()])], 0, "tweet"),
    "two/data/tweet_media/9007199254740993123-Photo.jpg": "two",
    "three/data/tweets.js": wrap([tweet([photo()])]),
    "three/data/tweet_media/9007199254740993123-Photo.jpg": "wrong family",
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.matched, 2);
  assert.equal(done.photoReview.counts.unmatched, 1);
});
test("X does not normalize unsafe URLs, substitute numeric IDs or use video thumbnails as originals", async (t) => {
  const urls = [
    "https://pbs.twimg.com/media/../Photo.jpg",
    "https://pbs.twimg.com/media/%50hoto.jpg",
    "https://pbs.twimg.com/media/Photo.jpg?name=orig",
    "https://pbs.twimg.com.evil/media/Photo.jpg",
    "file:///Photo.jpg",
    "https://user@pbs.twimg.com/media/Photo.jpg",
  ];
  const f = await fixture(t, {
    [metadataPath]: wrap([
      tweet(urls.map((media_url_https) => photo("Photo", { media_url_https }))),
      tweet([photo("Photo", { type: "animated_gif" })]),
      { tweet: { id_str: 123, extended_entities: { media: [photo()] } } },
    ]),
    "data/tweets_media/9007199254740993123-Photo.jpg": "kept",
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 8);
  assert.equal(done.photoReview.counts.matched, 0);
});
test("X split archives use selected receipt entries and retain collisions", async (t) => {
  const f = await fixture(t);
  const parts = path.join(f.root, "parts");
  await fs.mkdir(parts);
  const selected = [];
  for (const [name, items] of [
    ["metadata.zip", [{ name: metadataPath, data: entries[metadataPath] }]],
    [
      "one.zip",
      [
        {
          name: "data/tweets_media/9007199254740993123-Photo.jpg",
          data: "one",
        },
      ],
    ],
    [
      "two.zip",
      [
        {
          name: "data/tweets_media/9007199254740993123-Photo.jpg",
          data: "two",
        },
      ],
    ],
  ]) {
    const file = path.join(parts, name);
    await fs.writeFile(file, zip(items));
    selected.push(file);
  }
  async function preserve(paths) {
    const j = await f.runtime.request("create", { provider: "X" });
    await f.runtime.request("archiveSet", { id: j.id, paths });
    await f.runtime.request("destination", { id: j.id, path: f.destination });
    await f.runtime.request("inspect", { id: j.id });
    await wait(f.runtime, j.id);
    await f.runtime.request("start", { id: j.id });
    assert.equal((await wait(f.runtime, j.id)).state, "verified");
    await f.runtime.request("photoReview", { id: j.id });
    return wait(f.runtime, j.id, true);
  }
  assert.equal(
    (await preserve(selected.slice(0, 2))).photoReview.counts.matched,
    1,
  );
  assert.equal((await preserve(selected)).photoReview.counts.ambiguous, 1);
});
test("X bounds post and media lists and verifies the full original script hash before decoding", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: wrap(Array(100001).fill({})),
    "data/tweets-part1.js": wrap([tweet(Array(30001).fill(photo()))], 1),
  });
  let done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 2);
  await fs.writeFile(path.join(done.output, "files", metadataPath), wrap([]));
  done = await f.review();
  assert.match(
    (await f.report(done)).records.find((r) => r.path === metadataPath).issue,
    /differs/,
  );
});
test("X text-only posts are excluded and repeated media references are retained without deduplication", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: wrap([
      tweet([photo(), photo()]),
      { tweet: { id_str: "123", full_text: "text only" } },
      {
        tweet: {
          id_str: "124",
          entities: { media: [photo()] },
          extended_entities: { media: [] },
        },
      },
    ]),
    "data/tweets_media/9007199254740993123-Photo.jpg": "keep",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 2);
  assert.equal(report.mediaFiles.length, 1);
});
test("X malformed authoritative media containers do not fall back to a partial alternative", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: wrap([
      {
        tweet: {
          id_str: "123",
          entities: { media: [photo()] },
          extended_entities: null,
        },
      },
      { tweet: { id_str: "124", entities: { media: {} } } },
      null,
    ]),
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.invalid, 3);
  assert.equal(done.photoReview.counts.matched, 0);
});

test("X playback variants stay separate from posters, preserve missing variants and retain restart roles", async (t) => {
  const { playbackEntries } = require("./x-fixture.cjs");
  const f = await fixture(t, playbackEntries);
  const done = await f.review(),
    report = await f.report(done);
  assert.deepEqual(report.counts, {
    matched: 2,
    unmatched: 1,
    ambiguous: 0,
    invalid: 0,
  });
  assert.equal(
    report.records.every((r) => r.mediaRole === "playback"),
    true,
  );
  assert.equal(report.uninterpretedFiles[0].path.endsWith("Poster.jpg"), true);
  assert.equal(report.records[0].candidates[0].endsWith("-Clip.mp4"), true);
  assert.equal(report.records[1].candidates.length, 0); // higher bitrate is absent
  await f.restart();
  assert.equal(
    (await f.runtime.request("list"))[0].photoReview.preview[0].mediaRole,
    "playback",
  );
  for (const [name, content] of Object.entries(playbackEntries))
    assert.equal(
      await fs.readFile(path.join(done.output, "files", name), "utf8"),
      content,
    );
});
test("X playback rejects URL tricks, HLS, invalid variants and oversized variant lists without poster fallback", async (t) => {
  const { video } = require("./x-fixture.cjs");
  const urls = [
    "https://video.twimg.com/tweet_video/Clip.mp4?tag=1",
    "https://video.twimg.com/tweet_video/%43lip.mp4",
    "https://video.twimg.com/tweet_video/../Clip.mp4",
    "https://video.twimg.com.evil/tweet_video/Clip.mp4",
    "https://user@video.twimg.com/tweet_video/Clip.mp4",
    "https://video.twimg.com/tweet_video/Clip.mp4#frag",
    "https://video.twimg.com/ext_tw_video/1/pu/pl/Clip.m3u8",
  ];
  const m = video();
  m.video_info.variants = urls.map((url) => ({
    url,
    content_type: "video/mp4",
  }));
  m.video_info.variants.push(null, {
    url: "https://video.twimg.com/tweet_video/Clip.mp4",
    content_type: "application/x-mpegURL",
  });
  const big = video();
  big.video_info.variants = Array(33).fill(big.video_info.variants[0]);
  const f = await fixture(t, {
    [metadataPath]: wrap([tweet([m, big])]),
    "data/tweets_media/9007199254740993123-Clip.mp4": "selected",
    "data/tweets_media/9007199254740993123-Poster.jpg": "poster",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.invalid, 10);
  assert.equal(report.counts.matched, 0);
});
test("X playback recognizes observed amplify/avc1 form but keeps duplicate references and archive collisions", async (t) => {
  const { video } = require("./x-fixture.cjs");
  const m = video();
  m.video_info.variants = [
    {
      content_type: "video/mp4",
      url: "https://video.twimg.com/amplify_video/12/pu/vid/avc1/640x360/Clip.mp4",
    },
  ];
  const f = await fixture(t, {
    [metadataPath]: wrap([tweet([m, m])]),
    "data/tweets_media/9007199254740993123-Clip.mp4": "clip",
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.matched, 2);
  assert.equal(report.mediaFiles.length, 1);
});
test("X streams a script above 8 MiB, keeps UTF-8 and stable entry positions, without editing originals", async (t) => {
  const posts = Array.from({ length: 9000 }, (_, i) => ({
    tweet: { id_str: String(i + 1), full_text: "🌿".repeat(260) },
  }));
  posts.push(tweet([photo()]));
  const content = wrap(posts);
  assert.ok(Buffer.byteLength(content) > 8 * 1024 ** 2);
  const f = await fixture(t, {
    [metadataPath]: content,
    "data/tweets_media/9007199254740993123-Photo.jpg": "photo",
  });
  const done = await f.review(),
    report = await f.report(done);
  assert.equal(report.counts.matched, 1);
  assert.equal(report.records[0].id, `${metadataPath}#9000/0`);
  assert.equal(
    await fs.readFile(path.join(done.output, "files", metadataPath), "utf8"),
    content,
  );
});
test("X streamed partial results are discarded on late executable suffix, syntax error and changed hash", async (t) => {
  const content = wrap([tweet([photo()])]);
  const f = await fixture(t, {
    [metadataPath]: content + "evil()",
    "data/tweets-part1.js": wrap([tweet([photo()])], 1).replace(/\];$/, ",];"),
    "data/tweets_media/9007199254740993123-Photo.jpg": "photo",
  });
  let report = await f.report(await f.review());
  assert.equal(report.counts.matched, 0);
  assert.equal(report.counts.invalid, 2);
  // Same-size different valid script must never commit its provisional association.
  await fs.writeFile(
    path.join(f.job.output, "files", metadataPath),
    content + "      ",
  );
  report = await f.report(await f.review());
  assert.equal(report.counts.matched, 0);
  assert.match(
    report.records.find((r) => r.path === metadataPath).issue,
    /fingerprint|differs/,
  );
});
test("X streamed metadata bounds individual entries, nesting and retained output without partial success", async (t) => {
  const f = await fixture(t, {
    [metadataPath]: wrap([
      { tweet: { id_str: "123", full_text: "a".repeat(1024 ** 2) } },
    ]),
    "data/tweets-part1.js":
      "window.YTD.tweets.part1 = [" +
      "[".repeat(129) +
      "0" +
      "]".repeat(129) +
      "];",
    "data/tweets-part2.js": wrap(
      Array.from({ length: 4500 }, () => ({
        tweet: {
          id_str: "123",
          full_text: "x".repeat(4096),
          extended_entities: { media: [photo()] },
        },
      })),
      2,
    ),
  });
  const report = await f.report(await f.review());
  assert.equal(report.counts.invalid, 3);
  assert.equal(report.counts.unmatched, 0);
  assert.ok(report.records.some((r) => /1 MiB/.test(r.issue)));
  assert.ok(report.records.some((r) => /nesting/.test(r.issue)));
  assert.ok(report.records.some((r) => /budget/.test(r.issue)));
});

test("X streaming pause discards provisional results and retry after API restart retains preservation", async (t) => {
  const posts = Array.from({ length: 9000 }, (_, i) => ({
    tweet: { id_str: String(i + 1), full_text: "a".repeat(1024) },
  }));
  posts.push(tweet([photo()]));
  const f = await fixture(t, {
    [metadataPath]: wrap(posts),
    "data/tweets_media/9007199254740993123-Photo.jpg": "photo",
  });
  await f.runtime.request("photoReview", { id: f.job.id });
  await f.runtime.request("pause", { id: f.job.id });
  const paused = await wait(f.runtime, f.job.id, true);
  assert.equal(paused.photoReview.state, "paused");
  assert.equal(paused.state, "verified");
  assert.equal(paused.photoReview.report, undefined);
  await f.restart();
  const done = await f.review();
  assert.equal(done.photoReview.counts.matched, 1);
  assert.equal(done.state, "verified");
});
