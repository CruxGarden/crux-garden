const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  photoFixture,
} = require("../../packages/migration-engine/tests/photo-fixture.cjs");
const path = require("node:path");

for (const variant of ["entries", "labeledEntries"]) {
  test(`Instagram ${variant} export review embeds, renders untrusted text safely, retains history and fits a phone`, async ({
    page,
  }) => {
    let cleanup;
    const f = await photoFixture(
      {
        after(fn) {
          cleanup = fn;
        },
      },
      require("../../packages/migration-engine/tests/instagram-fixture.cjs")[
        variant
      ],
      "Instagram",
    );
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
        .filter({ hasText: "Instagram" })
        .click();
      await page
        .getByRole("button", { name: "Review export media", exact: true })
        .click();
      const section = page.getByRole("region", { name: "Export media review" });
      await expect(section.getByRole("status")).toHaveText(
        "1 matched · 0 ambiguous · 1 unmatched · 1 unreadable or unrecognized",
      );
      await section
        .getByText("Review records (up to 50, problems first)")
        .click();
      await expect(
        section.getByText("Clip <script>fixture</script>", { exact: true }),
      ).toBeVisible();
      await expect(section.locator("script")).toHaveCount(0);
      await expect(
        section.getByText(
          "Unsafe or non-local media reference; never opened or fetched.",
        ),
      ).toBeVisible();
      await page.setViewportSize({ width: 420, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await expect
        .poll(() =>
          section.locator("details").evaluate((details) => {
            const last = details.querySelector("li:last-child");
            return (
              !!last &&
              last.getBoundingClientRect().bottom <=
                details.getBoundingClientRect().bottom + 1
            );
          }),
        )
        .toBe(true);
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
      await section
        .getByText("Clip <script>fixture</script>", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        section.getByText("Clip <script>fixture</script>", { exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: path.resolve(
          __dirname,
          `../../test-results/migrate-instagram-${variant}.png`,
        ),
        fullPage: true,
      });
      await f.restart();
      await page.reload();
      await page.getByRole("button", { name: "Bring files home" }).click();
      await page
        .locator(".migration-history button")
        .filter({ hasText: "Instagram" })
        .click();
      await expect(section.getByRole("status")).toContainText("1 matched");
    } finally {
      await cleanup();
    }
  });
}
