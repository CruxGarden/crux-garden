import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
const zipFixture = require("../packages/migration-engine/tests/zip-fixture.cjs");
const tar = require("../packages/migration-engine/node_modules/tar-stream");
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const home = fileURLToPath(new URL("..", import.meta.url));
for (const app of [
  "apps/migration/src-tauri/target/release/bundle/macos/Crux Garden Migrate Tauri Preview.app",
]) {
  const runtime = path.join(home, app, "Contents/Resources/runtime");
  // Hello is pure protocol negotiation: never query status or access a real library here.
  const { PhotosBridge } = require(path.join(runtime, "photos-bridge.cjs"));
  const photos = new PhotosBridge(path.join(runtime, "photos-helper"));
  try {
    const hello = await photos.request("hello");
    assert.equal(hello.protocol, 1);
    assert.equal(hello.fixture, false);
    assert.equal(hello.authorizationRequests, false);
  } finally {
    await photos.close();
  }
  const fixture = await mkdtemp(path.join(tmpdir(), "home-package-check-"));
  let child;
  let exit;
  let sequence = 0;
  const pending = new Map();
  function launch() {
    child = spawn(
      path.join(runtime, "node"),
      [path.join(runtime, "backend.cjs"), path.join(fixture, "profile")],
      { stdio: ["pipe", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" } },
    );
    child.stderr.on("data", () => {});
    exit = new Promise((resolve) => child.once("exit", resolve));
    createInterface({ input: child.stdout }).on("line", (line) => {
      const reply = JSON.parse(line);
      const waiter = pending.get(reply.id);
      assert.ok(waiter, "Every response must belong to a pending request");
      pending.delete(reply.id);
      reply.error
        ? waiter.reject(new Error(reply.error))
        : waiter.resolve(reply.result);
    });
  }
  function request(command, args = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(
        () => reject(new Error(`Packaged runtime timed out: ${command}`)),
        30000,
      );
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(JSON.stringify({ id, command, args }) + "\n");
    });
  }
  async function settle(id) {
    for (let n = 0; n < 150; n++) {
      const job = (await request("list")).find((j) => j.id === id);
      if (!["running", "inspecting"].includes(job.state)) {
        await new Promise((r) => setTimeout(r, 100));
        return job;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Packaged migration did not settle");
  }
  async function close() {
    child.stdin.end();
    const timeout = setTimeout(() => child.kill(), 5000);
    assert.equal(await exit, 0, "Packaged API must close cleanly");
    clearTimeout(timeout);
  }
  try {
    launch();
    assert.equal((await request("info")).cruxCount, 0);
    const source = path.join(fixture, "source");
    const destination = path.join(fixture, "destination");
    await mkdir(source);
    await mkdir(destination);
    await writeFile(path.join(source, "memory.txt"), "A portable memory.");
    const job = await request("create", { provider: "Dropbox" });
    await request("source", { id: job.id, path: source });
    await request("destination", { id: job.id, path: destination });
    await request("inspect", { id: job.id });
    assert.equal((await settle(job.id)).state, "ready");
    await request("start", { id: job.id });
    const done = await settle(job.id);
    assert.equal(done.state, "verified", done.error);
    assert.equal(
      await readFile(path.join(done.output, "files/memory.txt"), "utf8"),
      "A portable memory.",
    );
    const pack = tar.pack();
    const parts = [];
    pack.entry({ name: "memory.txt" }, "A portable archive.");
    pack.finalize();
    for await (const part of pack) parts.push(part);
    for (const [name, bytes] of [
      [
        "export.zip",
        zipFixture([
          { name: "memory.txt", data: "A portable archive.", deflate: true },
        ]),
      ],
      ["export.tar.gz", gzipSync(Buffer.concat(parts))],
    ]) {
      const archivePath = path.join(fixture, name);
      await writeFile(archivePath, bytes);
      const archiveJob = await request("create", { provider: "Flickr" });
      await request("source", { id: archiveJob.id, path: archivePath });
      await request("destination", { id: archiveJob.id, path: destination });
      await request("inspect", { id: archiveJob.id });
      const review = await settle(archiveJob.id);
      assert.equal(review.state, "ready", review.error);
      await request("start", { id: archiveJob.id });
      const preserved = await settle(archiveJob.id);
      assert.equal(preserved.state, "verified", preserved.error);
      assert.equal(
        await readFile(path.join(preserved.output, "files/memory.txt"), "utf8"),
        "A portable archive.",
      );
      assert.deepEqual(
        await readFile(path.join(preserved.output, "original", name)),
        bytes,
      );
    }
    const exportParts = path.join(fixture, "export-parts");
    await mkdir(exportParts);
    const selected = [];
    for (const name of ["export.zip", "export.tar.gz"]) {
      const file = path.join(exportParts, name);
      await writeFile(file, await readFile(path.join(fixture, name)));
      selected.push(file);
    }
    const partsJob = await request("create", { provider: "Flickr" });
    await request("archiveSet", { id: partsJob.id, paths: selected });
    await request("destination", { id: partsJob.id, path: destination });
    await request("inspect", { id: partsJob.id });
    assert.equal((await settle(partsJob.id)).state, "ready");
    await request("start", { id: partsJob.id });
    const partResult = await settle(partsJob.id);
    assert.equal(partResult.state, "verified", partResult.error);
    for (const name of ["export.zip", "export.tar.gz"]) {
      assert.equal(
        await readFile(
          path.join(partResult.output, "files", name, "memory.txt"),
          "utf8",
        ),
        "A portable archive.",
      );
      assert.deepEqual(
        await readFile(path.join(partResult.output, "original", name)),
        await readFile(path.join(exportParts, name)),
      );
    }
    const photoSource = path.join(fixture, "photo-source");
    await mkdir(photoSource);
    await writeFile(
      path.join(photoSource, "photo_101.json"),
      JSON.stringify({ id: "101", name: "Packaged photo" }),
    );
    await writeFile(
      path.join(photoSource, "summer_101_o.jpg"),
      "Synthetic photo bytes",
    );
    const photoJob = await request("create", { provider: "Flickr" });
    await request("source", { id: photoJob.id, path: photoSource });
    await request("destination", { id: photoJob.id, path: destination });
    await request("inspect", { id: photoJob.id });
    await settle(photoJob.id);
    await request("start", { id: photoJob.id });
    await settle(photoJob.id);
    await request("photoReview", { id: photoJob.id });
    let reviewed;
    for (let i = 0; i < 150; i++) {
      reviewed = (await request("list")).find((j) => j.id === photoJob.id);
      if (reviewed.photoReview.state !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(
      reviewed.photoReview.state,
      "complete",
      reviewed.photoReview.error,
    );
    assert.equal(reviewed.photoReview.counts.matched, 1);
    const photoReport = JSON.parse(
      await readFile(
        path.join(reviewed.output, reviewed.photoReview.report),
        "utf8",
      ),
    );
    assert.equal(photoReport.records[0].candidates[0], "summer_101_o.jpg");
    const takeoutSource = path.join(fixture, "takeout-source");
    await mkdir(takeoutSource);
    await writeFile(path.join(takeoutSource, "photo.jpg"), "Takeout fixture");
    await writeFile(
      path.join(takeoutSource, "photo.jpg.supplemental-metadata.json"),
      JSON.stringify({
        title: "photo.jpg",
        photoTakenTime: { timestamp: "123" },
      }),
    );
    const takeoutJob = await request("create", { provider: "Google Photos" });
    await request("source", { id: takeoutJob.id, path: takeoutSource });
    await request("destination", { id: takeoutJob.id, path: destination });
    await request("inspect", { id: takeoutJob.id });
    await settle(takeoutJob.id);
    await request("start", { id: takeoutJob.id });
    await settle(takeoutJob.id);
    await request("photoReview", { id: takeoutJob.id });
    let takeoutResult;
    for (let i = 0; i < 150; i++) {
      takeoutResult = (await request("list")).find(
        (j) => j.id === takeoutJob.id,
      );
      if (takeoutResult.photoReview.state !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(
      takeoutResult.photoReview.state,
      "complete",
      takeoutResult.photoReview.error,
    );
    assert.equal(takeoutResult.photoReview.counts.matched, 1);
    const selectedJob = await request("create", { provider: "iCloud Photos" });
    await request("fileSet", {
      id: selectedJob.id,
      paths: [path.join(takeoutSource, "photo.jpg")],
    });
    await request("destination", { id: selectedJob.id, path: destination });
    await request("inspect", { id: selectedJob.id });
    assert.equal((await settle(selectedJob.id)).inspection.files, 1);
    await request("start", { id: selectedJob.id });
    const selectedResult = await settle(selectedJob.id);
    assert.equal(selectedResult.state, "verified", selectedResult.error);
    const selectedReport = JSON.parse(
      await readFile(path.join(selectedResult.output, "report.json"), "utf8"),
    );
    assert.deepEqual(selectedReport.selectedFiles, ["photo.jpg"]);
    assert.equal(selectedReport.files.length, 1);
    await close();
    launch();
    assert.deepEqual(
      (await request("list")).find((j) => j.id === selectedJob.id).sourceFiles,
      ["photo.jpg"],
    );
    assert.equal((await request("info")).cruxCount, 0);
    assert.equal((await request("list"))[0].state, "verified");
    assert.equal(
      (await request("list")).find((j) => j.id === takeoutJob.id).photoReview
        .counts.matched,
      1,
    );
    assert.equal(
      (await request("list")).find((j) => j.id === photoJob.id).photoReview
        .counts.matched,
      1,
    );
    await close();
    console.log(
      `${app}: packaged API, native SQLite, zero Cruxes, selected files/folder/ZIP/TAR.GZ and multiple-part preservation, Flickr/Google Photos metadata review, verification and restart passed`,
    );
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await exit;
    }
    await rm(fixture, { recursive: true, force: true });
  }
}
