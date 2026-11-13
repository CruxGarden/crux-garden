const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  createMigrationRuntime,
} = require("../../packages/migration-engine/dist/backend.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
for (const provider of ["iCloud Drive", "iCloud Messages"]) {
  test(`${provider} selected file preservation embeds`, async ({ page }) => {
    const root = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "migrate-files-ui-")),
      ),
      source = path.join(root, "source"),
      dest = path.join(root, "copies");
    await fs.mkdir(source);
    await fs.mkdir(dest);
    const data =
      provider === "iCloud Messages"
        ? require("../../packages/migration-engine/tests/messages-fixture.cjs")
            .data
        : {
            "家計.txt": "document",
            "IMG_01.MOV": "video",
            "IMG_01.xmp": "sidecar",
          };
    const names = Object.keys(data);
    for (const name of [...names, "excluded.txt"])
      await fs.writeFile(path.join(source, name), data[name] || "excluded");
    let runtime = await createMigrationRuntime(path.join(root, "profile"));
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
      await page.getByRole("button", { name: provider, exact: true }).click();
      await page
        .getByRole("button", { name: `Start ${provider} import`, exact: true })
        .click();
      if (provider === "iCloud Messages") {
        await expect(page.getByText(/^Manual copies only\./)).toBeVisible();
        await page
          .getByText("How to prepare your iCloud Messages export", {
            exact: true,
          })
          .click();
        await page
          .getByRole("checkbox", {
            name: "Save and inspect a readable copy",
            exact: true,
          })
          .click();
        await expect
          .poll(
            async () =>
              (await runtime.request("list"))[0].checklist?.["save-pdf"],
          )
          .toBe(true);
        await page
          .getByText("How to prepare your iCloud Messages export", {
            exact: true,
          })
          .click();
      }
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
        .getByRole("button", { name: "Check for existing copies", exact: true })
        .click();
      await expect(
        page.getByText("Matching files: 0 · No verified match found: 3", {
          exact: true,
        }),
      ).toBeVisible();
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
        page.getByText("Your files are preserved and verified.", {
          exact: true,
        }),
      ).toBeVisible();
      const [job] = await runtime.request("list");
      expect(job.localComparison.counts.notFound).toBe(3);
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
      await expect
        .poll(() =>
          page.evaluate(() => {
            const canvas = document.querySelector("canvas.plasma-ground");
            return (
              !canvas ||
              Math.abs(
                canvas.width / canvas.height - innerWidth / innerHeight,
              ) < 0.01
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        fullPage: true,
        path: path.resolve(
          __dirname,
          `../../test-results/migrate-${provider === "iCloud Messages" ? "messages" : "file-selection"}.png`,
        ),
      });
      await runtime.close();
      runtime = await createMigrationRuntime(path.join(root, "profile"));
      await page.reload();
      await page.getByRole("button", { name: "Bring files home" }).click();
      await page
        .locator(".migration-history button")
        .filter({ hasText: provider })
        .click();
      await expect(
        page.getByText("3 files selected", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Matching files: 0 · No verified match found: 3", {
          exact: true,
        }),
      ).toBeVisible();
      if (provider === "iCloud Messages") {
        await expect(page.getByText(/^Manual copies only\./)).toBeVisible();
        await expect(
          page.getByRole("region", {
            name: "Export media review",
            exact: true,
          }),
        ).toHaveCount(0);
        const saved = (await runtime.request("list"))[0];
        expect(saved.photoReview).toBeUndefined();
        expect(saved.mailReview).toBeUndefined();
        await page
          .getByText("How to prepare your iCloud Messages export", {
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("checkbox", {
            name: "Save and inspect a readable copy",
            exact: true,
          }),
        ).toBeChecked();
      }
    } finally {
      await runtime.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
