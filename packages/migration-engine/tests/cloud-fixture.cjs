const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Readable } = require("node:stream");
const { createHash } = require("node:crypto");
const { createMigrationRuntime } = require("../dist/backend.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t, opts = {}) {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-cloud-")),
  );
  const calls = [];
  const objects =
    opts.objects ||
    new Map([
      ["photos/one.jpg", Buffer.from("one photo")],
      ["photos/two.jpg", Buffer.from("two photo")],
      ["private.txt", Buffer.from("unselected")],
    ]);
  const versions = new Map([...objects.keys()].map((k) => [k, '"v1"']));
  const s3Factory = (config) => ({
    async send(command, options) {
      const a = command.input,
        op = command.constructor.name.replace(/\d+$/, "");
      calls.push({ op, ...a });
      if (op === "ListObjectsV2Command") {
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(a.Prefix || ""))
          .sort();
        if (a.Delimiter) {
          const prefixes = [
            ...new Set(
              keys
                .filter((k) => k.slice((a.Prefix || "").length).includes("/"))
                .map(
                  (k) =>
                    (a.Prefix || "") +
                    k.slice((a.Prefix || "").length).split("/")[0] +
                    "/",
                ),
            ),
          ];
          return {
            CommonPrefixes: prefixes.map((Prefix) => ({ Prefix })),
            Contents: keys
              .filter((k) => !k.slice((a.Prefix || "").length).includes("/"))
              .map((Key) => ({
                Key,
                Size: objects.get(Key).length,
                ETag: versions.get(Key),
              })),
          };
        }
        const index = Number(a.ContinuationToken || 0),
          selected = keys.slice(index, index + 1);
        return {
          Contents: selected.map((Key) => ({
            Key,
            Size: objects.get(Key).length,
            ETag: versions.get(Key),
          })),
          IsTruncated: index + 1 < keys.length,
          NextContinuationToken:
            index + 1 < keys.length ? String(index + 1) : undefined,
        };
      }
      const bytes = objects.get(a.Key);
      if (!bytes || a.IfMatch !== versions.get(a.Key))
        throw Error("AccessDenied fixture-private-secret");
      if (op === "GetObjectCommand" && opts.fail?.(a.Key))
        throw Error("fixture-private-secret");
      const result = {
        ContentLength: bytes.length,
        ETag: versions.get(a.Key),
        ChecksumType: "FULL_OBJECT",
        ChecksumSHA256: createHash("sha256").update(bytes).digest("base64"),
      };
      if (op === "HeadObjectCommand") return result;
      const body = Readable.from(
        (async function* () {
          for (let n = 0; n < bytes.length; n += 65536) {
            options?.abortSignal?.throwIfAborted();
            if (opts.slow) await sleep(10);
            yield bytes.subarray(n, n + 65536);
          }
        })(),
      );
      return { ...result, Body: body };
    },
    destroy() {},
  });
  const server = http.createServer((req, res) => {
    try {
      opts.http?.(new URL(req.url.slice(1)), req, res);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const open = (url, headers, signal, options) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path: "/" + url.href,
          headers,
          signal,
          method: options?.method ?? "GET",
        },
        resolve,
      );
      req.on("error", reject);
      req.end(options?.body);
    });
  const runtimeOptions = {
    cloud: {
      s3Factory,
      open,
      tokenExchange: opts.tokenExchange,
      dropboxTokenExchange: opts.dropboxTokenExchange,
      adapterFactory: opts.adapterFactory,
    },
  };
  let runtime = await createMigrationRuntime(
    path.join(dir, "profile"),
    runtimeOptions,
  );
  const call = (...args) => runtime.request(...args);
  const connect = () =>
    call("cloudConnect", {
      provider: "Amazon S3",
      bucket: "fixture-bucket",
      region: "us-east-1",
      accessKeyId: "fixture-access",
      secretAccessKey: "fixture-private-secret",
    });
  const settle = async (id) => {
    for (let n = 0; n < 1000; n++) {
      const j = (await call("cloudJobs")).find((v) => v.id === id);
      if (!["discovering", "scanning", "downloading"].includes(j.state))
        return j;
      await sleep(10);
    }
    throw Error("Job did not settle");
  };
  const prepare = async (connection, ids) => {
    await call("cloudBrowse", { connection });
    const job = await call("cloudCreate", { connection, selected: ids });
    await call("cloudDestination", { id: job.id, path: dir });
    return job;
  };
  t.after(async () => {
    await runtime.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    calls,
    objects,
    versions,
    call,
    connect,
    settle,
    prepare,
    async restart() {
      await runtime.close();
      runtime = await createMigrationRuntime(
        path.join(dir, "profile"),
        runtimeOptions,
      );
    },
    runtime: () => runtime,
  };
}
module.exports = { fixture, sha, sleep };
