const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  createMigrationRuntime,
} = require("../../packages/migration-engine/dist/backend.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
test("downloaded file selection embeds with honest scope and retained history", async ({
  page,
}) => {
  const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "migrate-files-ui-")),
    ),
    source = path.join(root, "source"),
    dest = path.join(root, "copies");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  const names = ["家計.txt", "IMG_01.MOV", "IMG_01.xmp"];
  for (const name of [...names, "excluded.txt"])
    await fs.writeFile(path.join(source, name), "fixture " + name);
  const runtime = await createMigrationRuntime(path.join(root, "profile"));
  try {
    await page.exposeFunction("harnessRequest", (command, args) =>
      runtime.request(command, args),
    );
    await page.exposeFunction("harnessPick", (id, kind) =>
      runtime.request(
        kind === "fileSet" ? "fileSet" : "destination",
        kind === "fileSet"
          ? { id, paths: names.map((n) => path.join(source, n)) }
          : { id, path: dest },
      ),
    );
    await page.addInitScript(() => {
      window.migrationHarnessClient = {
        request: (...args) => window.harnessRequest(...args),
        pick: (...args) => window.harnessPick(...args),
        reveal: async () => {},
      };
    });
    await page.goto("http://127.0.0.1:5189/tests/embedding/");
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .getByRole("button", { name: "iCloud Drive", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start iCloud Drive import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose files", exact: true })
      .click();
    await expect(
      page.getByText("3 files selected", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Choose destination", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review files", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible();
    const [job] = await runtime.request("list");
    expect((await fs.readdir(path.join(job.output, "files"))).sort()).toEqual(
      names.sort(),
    );
    await page.setViewportSize({ width: 420, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByText("3 files selected", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/migrate-file-selection.png",
      ),
    });
    await page.reload();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .locator(".migration-history button")
      .filter({ hasText: "iCloud Drive" })
      .click();
    await expect(
      page.getByText("3 files selected", { exact: true }),
    ).toBeVisible();
  } finally {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
