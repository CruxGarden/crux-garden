const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  dropboxFixture,
} = require("../../packages/migration-engine/tests/dropbox-fixture.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
test("Dropbox setup, PKCE fixture, selected folder and preservation use the embedded shared UI", async ({
  page,
}) => {
  let cleanup;
  const f = await dropboxFixture({
    after(fn) {
      cleanup = fn;
    },
  });
  try {
    await fs.mkdir(path.join(f.dir, "copies"));
    await page.exposeFunction("harnessRequest", async (command, args) => {
      if (command === "cloudAuthorize")
        return f.complete(await f.call(command, args));
      return f.call(command, args);
    });
    await page.exposeFunction("harnessPick", (id, kind, context) =>
      f.call(kind, {
        id,
        path: kind === "destination" ? path.join(f.dir, "copies") : f.dir,
        connection: context?.connection,
      }),
    );
    await page.addInitScript(() => {
      window.migrationHarnessClient = {
        // Match Tauri's string rejection contract, rather than Electron's Error.
        request: async (...args) => {
          try {
            return await window.harnessRequest(...args);
          } catch (error) {
            throw error.message;
          }
        },
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
      .selectOption("Dropbox");
    await page
      .getByText("One-time Dropbox connection setup", { exact: true })
      .click();
    await expect(
      page.getByText("http://127.0.0.1:53683/callback/dropbox", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Connect Dropbox", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Enter your Dropbox app key.",
    );
    await page
      .getByLabel("Dropbox app key", { exact: true })
      .fill("fixtureAppKey");
    await page
      .getByRole("button", { name: "Connect Dropbox", exact: true })
      .click();
    await expect(
      page.getByLabel("Dropbox app key", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("button", {
        name: "Prepare selected migration",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Open Trips", exact: true }).click();
    await page
      .getByRole("button", { name: "Load more files", exact: true })
      .click();
    await expect(
      page.getByText("second.jpg · 0.0 MB", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Select this entire folder: Trips", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Prepare selected migration", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start selected migration", exact: true })
      .click();
    await expect(
      page.getByText(/Downloaded and checked — ready to preserve/),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/1 reused locally/)).toBeVisible();
    expect(f.calls.filter((c) => c.path === "/2/files/download")).toHaveLength(
      1,
    );
    await page.setViewportSize({ width: 420, height: 850 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
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
    const job = (await f.call("list"))[0];
    expect(
      await fs.readFile(path.join(job.output, "files/files/Trips/café 📷.jpg")),
    ).toEqual(f.bytes);
  } finally {
    await cleanup();
  }
});
