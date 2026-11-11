const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  photoFixture,
} = require("../../packages/migration-engine/tests/photo-fixture.cjs");
const path = require("node:path");

test("Flickr metadata review embeds, renders untrusted text safely, retains history and fits a phone", async ({
  page,
}) => {
  let cleanup;
  const f = await photoFixture({
    after(fn) {
      cleanup = fn;
    },
  });
  try {
    await page.exposeFunction("harnessRequest", (command, args) =>
      f.runtime.request(command, args),
    );
    await page.addInitScript(() => {
      window.migrationHarnessClient = {
        request: (...args) => window.harnessRequest(...args),
        pick: async () => {},
        reveal: async () => {},
      };
    });
    await page.goto("http://127.0.0.1:5189/tests/embedding/");
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .locator(".migration-history button")
      .filter({ hasText: "Flickr" })
      .click();
    await page
      .getByRole("button", { name: "Review photo metadata", exact: true })
      .click();
    const section = page.getByRole("region", { name: "Photo metadata review" });
    await expect(section.getByRole("status")).toHaveText(
      "1 matched · 1 ambiguous · 2 unmatched · 1 unreadable or unrecognized",
    );
    await section
      .getByText("Review records (up to 50, problems first)")
      .click();
    await expect(
      section.getByText("Summer <script>test</script>", { exact: true }),
    ).toBeVisible();
    await expect(section.locator("script")).toHaveCount(0);
    await expect(
      section.getByText(
        "Photo ID is missing or disagrees with its sidecar filename.",
      ),
    ).toBeVisible();
    await page.setViewportSize({ width: 420, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/migrate-photo-review.png",
      ),
      fullPage: true,
    });
    await f.restart();
    await page.reload();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .locator(".migration-history button")
      .filter({ hasText: "Flickr" })
      .click();
    await expect(section.getByRole("status")).toContainText("1 matched");
  } finally {
    await cleanup();
  }
});
