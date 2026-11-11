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
    await close();
    launch();
    assert.equal((await request("info")).cruxCount, 0);
    assert.equal((await request("list"))[0].state, "verified");
    await close();
    console.log(
      `${app}: packaged API, native SQLite, zero Cruxes, folder/ZIP/TAR.GZ and multiple-part preservation, verification and restart passed`,
    );
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await exit;
    }
    await rm(fixture, { recursive: true, force: true });
  }
}
