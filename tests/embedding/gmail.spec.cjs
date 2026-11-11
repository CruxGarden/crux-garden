const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  gmailFixture,
} = require("../../packages/migration-engine/tests/gmail-fixture.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
test("Gmail read-only setup and selected label download embed with safe subjects and preserved metadata", async ({
  page,
}) => {
  let cleanup;
  const f = await gmailFixture({
    after(fn) {
      cleanup = fn;
    },
  });
  try {
    await fs.mkdir(path.join(f.dir, "copies"));
    await page.exposeFunction("harnessRequest", async (command, args) =>
      command === "cloudAuthorize"
        ? f.complete(await f.call(command, args))
        : f.call(command, args),
    );
    await page.exposeFunction("harnessPick", (id, kind, context) =>
      f.call(kind, {
        id,
        path: kind === "destination" ? path.join(f.dir, "copies") : f.dir,
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
      .selectOption("Gmail");
    await page
      .getByText("One-time Google connection setup", { exact: true })
      .click();
    await expect(page.getByText(/enable the Gmail API/)).toBeVisible();
    await page
      .getByRole("button", { name: "Connect Gmail", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Enter your Google desktop client ID.",
    );
    await page
      .getByLabel("Google desktop client ID", { exact: true })
      .fill("fixture.apps.googleusercontent.com");
    await page
      .getByRole("button", { name: "Connect Gmail", exact: true })
      .click();
    await expect(
      page.getByLabel("Google desktop client ID", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("button", {
        name: "Prepare selected migration",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Open Family", exact: true })
      .click();
    await expect(
      page.getByText("First <img src=x> [aa] · size unknown", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".cloud-list img")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Load more files", exact: true })
      .click();
    await expect(
      page.getByText("Second [bb] · size unknown", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Select this entire group: Family", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Prepare selected migration", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start selected migration", exact: true })
      .click();
    await expect(
      page.getByText(/Downloaded and checked — ready to preserve/),
    ).toBeVisible();
    const [job] = await f.call("cloudJobs");
    expect(job.files).toBe(2);
    expect(f.calls.filter((c) => c.query?.format === "raw")).toHaveLength(2);
    await page.setViewportSize({ width: 420, height: 850 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/migrate-gmail-account.png",
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
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible();
    const preserved = (await f.call("list"))[0];
    expect(
      await fs.readFile(
        path.join(preserved.output, "files/files/messages/aa.eml"),
      ),
    ).toEqual(f.data.get("aa"));
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(preserved.output, "files/migration-manifest.json"),
      ),
    );
    expect(
      manifest.files[0].metadata.labels.find((v) => v.id === "Label_1").name,
    ).toBe("Family");
  } finally {
    await cleanup();
  }
});
