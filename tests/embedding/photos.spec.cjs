const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  photosHostFixture,
} = require("../../packages/migration-engine/tests/photos-host-fixture.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
test("Photos host action handles cancellation/denial and preserves only explicit resource selections", async ({
  page,
}) => {
  test.skip(
    process.platform !== "darwin",
    "The native fixture requires macOS.",
  );
  const f = await photosHostFixture();
  try {
    await page.exposeFunction("harnessRequest", (command, args) =>
      f.call(command, args),
    );
    await page.exposeFunction("harnessPhotos", (options) => f.connect(options));
    await page.exposeFunction("harnessPick", (id, kind, context) =>
      f.call(kind, { id, path: f.dir, connection: context?.connection }),
    );
    await page.addInitScript(() => {
      window.migrationHarnessClient = {
        request: (...args) => window.harnessRequest(...args),
        connectPhotos: (options) => window.harnessPhotos(options),
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
      .selectOption("iCloud Photos");
    await expect(
      page.getByLabel("Allow iCloud downloads for this connection"),
    ).not.toBeChecked();
    expect(f.grants).toHaveLength(0);
    f.cancel = true;
    await page
      .getByRole("button", { name: "Connect iCloud Photos", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect iCloud Photos", exact: true }),
    ).toBeEnabled();
    expect(f.grants).toHaveLength(0);
    f.cancel = false;
    f.permission = "denied";
    await page
      .getByRole("button", { name: "Connect iCloud Photos", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Photos access is not available",
    );
    f.permission = "limited";
    await page.getByLabel("Allow iCloud downloads for this connection").check();
    await page
      .getByRole("button", { name: "Connect iCloud Photos", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Prepare selected migration",
        exact: true,
      }),
    ).toBeDisabled();
    expect(f.grants.at(-1).networkAllowed).toBe(true);
    await expect(
      page.getByText("iCloud downloads: allowed for this connection.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Allow iCloud downloads for this connection"),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", {
        name: "same-name.dat · Original companion video · size unknown",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Prepare selected migration", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Start selected migration",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Compare with local folder", exact: true })
      .click();
    await expect(
      page.getByText(
        "1 file size is still unknown. Space is checked as files download.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(/Local comparison:/)).toBeVisible();
    await page.setViewportSize({ width: 540, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/photos-host-selection.png",
      ),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Start selected migration", exact: true })
      .click();
    await expect(
      page.getByText(/Downloaded and checked — ready to preserve/),
    ).toBeVisible();
    const job = (await f.call("cloudJobs"))[0];
    expect(job.files).toBe(1);
    expect(job.unknownFiles).toBe(0);
    const receipt = JSON.parse(
      await fs.readFile(path.join(job.folder, "migration-manifest.json")),
    );
    expect(receipt.files).toHaveLength(1);
    expect(receipt.files[0].metadata.role).toBe("originalPairedVideo");
    expect(
      await fs.readFile(path.join(job.folder, "files", receipt.files[0].path)),
    ).toEqual(
      Buffer.concat([Buffer.from("fixture-role-9:"), Buffer.alloc(150000, 42)]),
    );
  } finally {
    await f.close();
  }
});
test("ordinary embedded clients never display a Photos connection option", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.migrationHarnessClient = {
      request: async (command) =>
        command === "info"
          ? {
              product: "migration",
              cruxCount: 0,
              runtime: "fixture",
              mood: {},
              capabilities: { cloudCollections: true },
            }
          : [],
      pick: async () => {},
      reveal: async () => {},
    };
  });
  await page.goto("http://127.0.0.1:5189/tests/embedding/");
  await page
    .getByRole("button", { name: "Cloud services", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Service", exact: true })
      .locator("option")
      .filter({ hasText: "iCloud Photos" }),
  ).toHaveCount(0);
});
