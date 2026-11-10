const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  createMigrationRuntime,
} = require("../../packages/migration-engine/dist/backend.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
test("download UI uses the real engine to pause, resume, review and preserve a network fixture", async ({
  page,
}) => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-download-ui-")),
  );
  const bytes = Buffer.alloc(12 * 1024 * 1024, 91);
  const ranges = [];
  const server = http.createServer(async (req, res) => {
    const at = req.headers.range
      ? Number(/bytes=(\d+)-/.exec(req.headers.range)[1])
      : 0;
    ranges.push(at);
    res.writeHead(at ? 206 : 200, {
      "content-length": bytes.length - at,
      "content-disposition": 'attachment; filename="example.bin"',
      etag: '"fixture-v1"',
      ...(at
        ? { "content-range": `bytes ${at}-${bytes.length - 1}/${bytes.length}` }
        : {}),
    });
    for (let i = at; i < bytes.length && !res.destroyed; i += 64 * 1024) {
      res.write(bytes.subarray(i, i + 64 * 1024));
      await new Promise((r) => setTimeout(r, 15));
    }
    if (!res.destroyed) res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const runtime = await createMigrationRuntime(path.join(dir, "profile"), {
    downloadOpen: (_url, headers, signal) =>
      new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${server.address().port}/`,
          { headers, signal },
          resolve,
        );
        req.on("error", reject);
      }),
  });
  try {
    await fs.mkdir(path.join(dir, "copies"));
    await page.exposeFunction("harnessRequest", (command, args) =>
      runtime.request(command, args),
    );
    await page.exposeFunction("harnessPick", (id, kind) =>
      runtime.request(kind, {
        id,
        path: kind === "downloadDestination" ? dir : path.join(dir, "copies"),
      }),
    );
    await page.addInitScript(() => {
      window.migrationHarnessClient = {
        request: (...args) => window.harnessRequest(...args),
        pick: (...args) => window.harnessPick(...args),
        reveal: async () => {},
      };
    });
    await page.goto("http://127.0.0.1:5189/tests/embedding/");
    await page.getByRole("button", { name: "Downloads", exact: true }).click();
    const link =
      "https://www.dropbox.com/scl/fi/ui-fixture/example.bin?rlkey=ui-secret";
    await page.getByLabel("Dropbox file link").fill(link);
    await page
      .getByRole("button", { name: "Prepare download", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start download", exact: true })
      .click();
    await expect
      .poll(async () => (await runtime.request("downloads"))[0].bytes, {
        timeout: 10000,
      })
      .toBeGreaterThan(4 * 1024 * 1024);
    await page
      .getByRole("button", { name: "Pause download", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume download", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Downloads", exact: true }).click();
    await expect(page.getByLabel("Dropbox file link")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Resume download", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Dropbox file link").fill(link);
    await page
      .getByRole("button", { name: "Resume download", exact: true })
      .click();
    await expect(page.getByText(/Downloaded — ready to review/)).toBeVisible({
      timeout: 10000,
    });
    expect(ranges.at(-1)).toBeGreaterThan(0);
    await page.screenshot({
      path: path.resolve(__dirname, "../../test-results/migrate-download.png"),
    });
    await page
      .getByRole("button", { name: "Review downloaded file", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose destination", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review files", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled({ timeout: 10000 });
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const job = (await runtime.request("list"))[0];
    expect(
      await fs.readFile(path.join(job.output, "files/example.bin")),
    ).toEqual(bytes);
  } finally {
    await runtime.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
