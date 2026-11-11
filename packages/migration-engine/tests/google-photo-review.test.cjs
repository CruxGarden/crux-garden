const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture, wait } = require("./photo-fixture.cjs");
const zipFixture = require("../../../apps/migration/tests/zip-fixture.cjs");
const photo = (title, extra = {}) =>
  JSON.stringify({
    title,
    photoTakenTime: {
      timestamp: "1593561600",
      formatted: "Jul 1, 2020, 12:00:00 AM UTC",
    },
    ...extra,
  });
const fixture = (t, entries) => photoFixture(t, entries, "Google Photos");

test("Takeout old/new sidecars remain scoped to exported folders and keep raw time/location values", async (t) => {
  const f = await fixture(t, {
    "Takeout/Google Photos/Photos from 2020/photo.jpg": "year photo",
    "Takeout/Google Photos/Photos from 2020/photo.jpg.json": photo(
      "photo.jpg",
      {
        creationTime: { timestamp: "999" },
        geoData: { latitude: 0, longitude: 0 },
        geoDataExif: { latitude: 12, longitude: 34 },
        url: "https://never-fetch.invalid/photo",
      },
    ),
    "Takeout/Google Photos/Album/photo.jpg": "album copy",
    "Takeout/Google Photos/Album/photo.jpg.supplemental-metadata.json":
      photo("photo.jpg"),
    "Takeout/Google Photos/Album/metadata.json": JSON.stringify({
      title: "Summer album",
    }),
    "Takeout/Google Photos/Album/note.json": JSON.stringify({
      title: "Not automatically an album",
    }),
  });
  const done = await f.review();
  assert.equal(done.photoReview.state, "complete", done.photoReview.error);
  assert.deepEqual(done.photoReview.counts, {
    matched: 2,
    ambiguous: 1,
    unmatched: 0,
    invalid: 1,
  });
  const report = await f.report(done);
  const photos = report.records.filter((r) => r.kind === "photo");
  assert.equal(photos[0].candidates.length, 1);
  assert.notEqual(photos[0].candidates[0], photos[1].candidates[0]);
  const timed = photos.find((r) => r.path.includes("2020"));
  assert.equal(timed.exportedTime.timestamp, "1593561600");
  assert.equal(timed.exportedLocation.geoData.latitude, 0);
  assert.equal(timed.exportedLocation.geoDataExif.latitude, 12);
  assert.equal(
    report.records.find((r) => r.kind === "album").members.length,
    1,
  );
  assert.equal(
    await fs.readFile(
      path.join(done.output, "files/Takeout/Google Photos/Album/photo.jpg"),
      "utf8",
    ),
    "album copy",
  );
  await f.restart();
  assert.equal(
    (await f.runtime.request("list"))[0].photoReview.counts.matched,
    2,
  );
});

test("Takeout asymmetric duplicate numbering and clipped suffixes use forward candidates, not inverse guesses", async (t) => {
  const long = "a".repeat(43) + ".jpg";
  const f = await fixture(t, {
    "photo(1).jpg": "indexed one",
    "photo.jpg": "base image",
    "photo.jpg.supplemental-metadata(1).json": photo("photo.jpg"),
    "movie(2).mp4": "indexed two",
    "movie.mp4(2).json": photo("movie.mp4"),
    [long]: "long image",
    [(long + ".supplemental-metadata").slice(0, 46) + ".json"]: photo(long),
  });
  const done = await f.review();
  assert.equal(done.photoReview.counts.matched, 3);
  const report = await f.report(done);
  assert.deepEqual(
    report.records.find((r) => r.title === "photo.jpg").candidates,
    ["photo(1).jpg"],
  );
  assert.equal(report.unassociatedMedia.length, 1);
});

test("clipped collisions, conflicting title and repeated sidecars never silently pick a media file", async (t) => {
  const title = "z".repeat(50) + ".jpg";
  const f = await fixture(t, {
    [title]: "same logical name",
    [title.slice(0, 46) + ".json"]: photo(title),
    [title + ".json"]: photo(title),
    "bad.jpg": "bad",
    "bad.jpg.json": photo("different.jpg"),
    "zero.jpg": "zero",
    "zero.jpg.json": photo("zero.jpg", { photoTakenTime: { timestamp: "0" } }),
  });
  const done = await f.review();
  assert.deepEqual(done.photoReview.counts, {
    matched: 1,
    ambiguous: 2,
    unmatched: 1,
    invalid: 0,
  });
  const report = await f.report(done);
  assert.match(
    report.records.find((r) => r.title === title).issue,
    /More than one/,
  );
  assert.match(
    report.records.find((r) => r.title === "different.jpg").issue,
    /disagree/,
  );
  assert.match(
    report.records.find((r) => r.title === "zero.jpg").issue,
    /zero/,
  );
});

test("Takeout never uses creationTime, unsafe titles, edited variants or another folder as fallback", async (t) => {
  const f = await fixture(t, {
    "original-edited.jpg": "edited only",
    "original.jpg.json": photo("original.jpg"),
    "year/photo.jpg.json": photo("photo.jpg"),
    "album/photo.jpg": "elsewhere",
    "invalid.jpg.json": photo("../invalid.jpg"),
    "missing.jpg.json": JSON.stringify({
      title: "missing.jpg",
      creationTime: { timestamp: "100" },
    }),
    "null.jpg.json": photo("null.jpg", { photoTakenTime: null }),
    "legacy/album.json": JSON.stringify({
      albumData: { title: "Wrapped album" },
    }),
  });
  const done = await f.review();
  assert.deepEqual(done.photoReview.counts, {
    matched: 0,
    ambiguous: 1,
    unmatched: 2,
    invalid: 3,
  });
  assert.equal((await f.report(done)).unassociatedMedia.length, 2);
});

test("selected split Takeout archives share logical folders, retain collisions and do not include unselected parts", async (t) => {
  const f = await fixture(t, { "keep.txt": "setup" });
  const parts = path.join(f.root, "parts");
  await fs.mkdir(parts);
  const name = "Takeout/Google Photos/Photos from 2020/photo.jpg";
  const selected = [];
  for (const [part, entries] of [
    [
      "metadata.zip",
      [
        {
          name: name + ".supplemental-metadata.json",
          data: photo("photo.jpg"),
        },
      ],
    ],
    ["media.zip", [{ name, data: "media one" }]],
    ["unselected.zip", [{ name, data: "not selected" }]],
  ]) {
    const file = path.join(parts, part);
    await fs.writeFile(file, zipFixture(entries));
    if (part !== "unselected.zip") selected.push(file);
  }
  async function preserve(paths) {
    const j = await f.runtime.request("create", { provider: "Google Photos" });
    await f.runtime.request("archiveSet", { id: j.id, paths });
    await f.runtime.request("destination", { id: j.id, path: f.destination });
    await f.runtime.request("inspect", { id: j.id });
    await wait(f.runtime, j.id);
    await f.runtime.request("start", { id: j.id });
    const preserved = await wait(f.runtime, j.id);
    assert.equal(preserved.state, "verified", preserved.error);
    await f.runtime.request("photoReview", { id: j.id });
    return wait(f.runtime, j.id, true);
  }
  const done = await preserve(selected);
  assert.equal(done.photoReview.counts.matched, 1);
  assert.deepEqual((await f.report(done)).records[0].candidates, [
    "media.zip/" + name,
  ]);
  const duplicate = await preserve([
    ...selected,
    path.join(parts, "unselected.zip"),
  ]);
  assert.equal(duplicate.photoReview.counts.ambiguous, 1);
  assert.equal((await f.report(duplicate)).records[0].candidates.length, 2);
});
