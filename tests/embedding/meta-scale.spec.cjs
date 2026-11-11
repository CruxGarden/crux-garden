const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  photoFixture,
} = require("../../packages/migration-engine/tests/photo-fixture.cjs");
const path = require("node:path");
for (const provider of ["Instagram", "Facebook"]) {
  test(`${provider} large metadata keeps a 50-record preview and saved summary`, async ({
    page,
  }) => {
    let cleanup;
    const posts = Array.from({ length: 10010 }, (_, i) => {
      const media = { uri: "media/video", title: `Post ${i}` };
      return provider === "Instagram"
        ? { media: [media], unused: "a".repeat(900) }
        : { attachments: [{ data: [{ media }] }], unused: "a".repeat(900) };
    });
    const file =
      provider === "Instagram"
        ? "your_instagram_activity/media/posts_1.json"
        : "posts/your_posts_1.json";
    const f = await photoFixture(
      {
        after(fn) {
          cleanup = fn;
        },
      },
      { [file]: JSON.stringify(posts), "media/video": "selected" },
      provider,
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
      const open = async () => {
        await page.getByRole("button", { name: "Bring files home" }).click();
        await page
          .locator(".migration-history button")
          .filter({ hasText: provider })
          .click();
      };
      await open();
      await page
        .getByRole("button", { name: "Review export media", exact: true })
        .click();
      const section = page.getByRole("region", { name: "Export media review" });
      await expect(section.getByRole("status")).toHaveText(
        "10010 matched · 0 ambiguous · 0 unmatched · 0 unreadable or unrecognized",
      );
      await section
        .getByText("Review records (up to 50, problems first)")
        .click();
      await expect(section.getByRole("listitem")).toHaveCount(50);
      await expect(
        section.getByText("Post 10009", { exact: true }),
      ).toHaveCount(0);
      await page.setViewportSize({ width: 420, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      // Wait for the shared disclosure animation before judging its final layout.
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
        .getByText("Post 49", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        section.getByText("Post 49", { exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: path.resolve(
          __dirname,
          `../../test-results/migrate-${provider.toLowerCase()}-scale.png`,
        ),
        fullPage: true,
      });
      await f.restart();
      await page.reload();
      await open();
      await expect(section.getByRole("status")).toContainText("10010 matched");
    } finally {
      await cleanup();
    }
  });
}
