const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  fixture,
} = require("../../packages/migration-engine/tests/cloud-fixture.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
test("selected cloud folder compares renamed local content, reuses bytes and preserves export through reusable UI", async ({
  page,
}) => {
  let cleanup;
  const f = await fixture({
    after(fn) {
      cleanup = fn;
    },
  });
  try {
    const local = path.join(f.dir, "local");
    await fs.mkdir(local);
    await fs.writeFile(
      path.join(local, "renamed.jpg"),
      f.objects.get("photos/one.jpg"),
    );
    await fs.mkdir(path.join(f.dir, "copies"));
    await page.exposeFunction("harnessRequest", (command, args) =>
      f.call(command, args),
    );
    await page.exposeFunction("harnessPick", (id, kind, context) =>
      f.call(kind, {
        id,
        path:
          kind === "cloudScanDirectory"
            ? local
            : kind === "destination"
              ? path.join(f.dir, "copies")
              : f.dir,
        connection: context?.connection,
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
    await page
      .getByRole("button", { name: "Cloud services", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Service", exact: true })
      .selectOption("Amazon S3");
    await page.getByLabel("Bucket", { exact: true }).fill("fixture-bucket");
    await page
      .getByLabel("Access key ID", { exact: true })
      .fill("fixture-access");
    await page
      .getByLabel("Secret access key", { exact: true })
      .fill("fixture-private-secret");
    await page
      .getByRole("button", { name: "Connect Amazon S3", exact: true })
      .click();
    await expect(
      page.getByLabel("Secret access key", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("button", {
        name: "Prepare selected migration",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Open photos", exact: true })
      .click();
    await page
      .getByLabel("Select this entire folder: photos", { exact: true })
      .check();
    await expect(
      page.getByText("1 selection.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Prepare selected migration", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Compare with local folder", exact: true })
      .click();
    await expect(
      page.getByText(/1 verified matches · 1 need downloading/),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Start selected migration", exact: true })
      .click();
    await expect(
      page.getByText(/Downloaded and checked — ready to preserve/),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/1 reused locally/)).toBeVisible();
    expect(
      f.calls.filter((c) => c.op === "GetObjectCommand").map((c) => c.Key),
    ).toEqual(["photos/two.jpg"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/migrate-cloud-selection.png",
      ),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Review cloud export", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose destination", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review files", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const j = (await f.call("list"))[0];
    expect(
      await fs.readFile(
        path.join(j.output, "files/files/photos/two.jpg"),
        "utf8",
      ),
    ).toBe("two photo");
  } finally {
    await cleanup();
  }
});
