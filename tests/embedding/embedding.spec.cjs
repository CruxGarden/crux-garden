const { test, expect } = require("../../tools/node_modules/@playwright/test");
test("Migration embeds with an injected host client and preserves host appearance", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5189/tests/embedding/");
  await expect(
    page.getByRole("button", { name: "Bring files home" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => ({
      tauri: !!window.__TAURI__,
      native: !!window.migrationAPI,
      accent: document.documentElement.style.getPropertyValue("--accent"),
      surface: document.documentElement.dataset.surfaceStyle,
    })),
  ).toEqual({
    tauri: false,
    native: false,
    accent: "#123456",
    surface: "solid",
  });
  await page.getByRole("button", { name: "Bring files home" }).click();
  const icons = page.locator(".migration-provider-list .service-icon img");
  await expect(icons).toHaveCount(32);
  await expect
    .poll(() =>
      icons.evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: require("node:path").resolve(
      __dirname,
      "../../test-results/migrate-service-icons.png",
    ),
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "Start Dropbox import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose source", exact: true })
    .click();
  expect(await page.evaluate(() => window.hostCalls)).toContain(
    "pick:host-job:source",
  );
  await expect(page.getByText("Example host")).toBeVisible();
  await page.screenshot({
    path: require("node:path").resolve(
      __dirname,
      "../../test-results/migration-embedded.png",
    ),
  });
});
