const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createMigrationRuntime } = require("../dist/backend.cjs");
async function wait(runtime, id, photo = false) {
  for (let n = 0; n < 500; n++) {
    const job = (await runtime.request("list")).find((j) => j.id === id);
    if (
      photo
        ? job.photoReview?.state !== "running"
        : !["running", "inspecting"].includes(job.state)
    )
      return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Photo fixture timed out");
}
async function photoFixture(t, entries, provider = "Flickr") {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-photo-")),
  );
  const source = path.join(root, "source"),
    destination = path.join(root, "destination"),
    profile = path.join(root, "profile");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const files = entries || {
    "metadata/photo_101.json": JSON.stringify({
      id: "101",
      name: "Summer <script>test</script>",
      date_taken: "2020-07-01 12:30:00",
      original: "https://should-never-be-fetched.invalid/101.jpg",
      comments: [{ text: "Keep this original field" }],
    }),
    "metadata/photo_102.json": JSON.stringify({
      id: "102",
      name: "Two candidates",
    }),
    "metadata/photo_103.json": JSON.stringify({
      id: "103",
      name: "Missing photo",
    }),
    "metadata/photo_104.json": JSON.stringify({ id: "999", name: "Wrong ID" }),
    "metadata/albums.json": JSON.stringify({
      albums: [{ id: "901", title: "Summer album", photos: ["101", "103"] }],
    }),
    "part-a/101_abcdef_o.jpg": "synthetic photo 101",
    "part-a/102_abcdef_o.jpg": "synthetic photo 102a",
    "part-b/102_abcdef_o.jpg": "synthetic photo 102b",
    "part-b/105_abcdef_o.mov": "synthetic video 105",
    "unknown.json": JSON.stringify({ id: "106" }),
    "ordinary-name.jpg": "unrecognized filename",
  };
  for (const [name, data] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await fs.writeFile(path.join(source, name), data);
  }
  let runtime = await createMigrationRuntime(profile);
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const job = await runtime.request("create", { provider });
  await runtime.request("source", { id: job.id, path: source });
  await runtime.request("destination", { id: job.id, path: destination });
  await runtime.request("inspect", { id: job.id });
  await wait(runtime, job.id);
  await runtime.request("start", { id: job.id });
  const done = await wait(runtime, job.id);
  if (done.state !== "verified") throw new Error(done.error);
  return {
    root,
    source,
    destination,
    job: done,
    get runtime() {
      return runtime;
    },
    async restart() {
      await runtime.close();
      runtime = await createMigrationRuntime(profile);
    },
    async review() {
      await runtime.request("photoReview", { id: job.id });
      return wait(runtime, job.id, true);
    },
    async report(done) {
      return JSON.parse(
        await fs.readFile(
          path.join(done.output, done.photoReview.report),
          "utf8",
        ),
      );
    },
  };
}
module.exports = { photoFixture, wait };
