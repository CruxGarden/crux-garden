const { test, expect } = require("../../tools/node_modules/@playwright/test");
const {
  photoFixture,
} = require("../../packages/migration-engine/tests/photo-fixture.cjs");
const path = require("node:path");
test("mail inventory embeds safely, fits narrow screens and survives API restart", async ({
  page,
}) => {
  let cleanup;
  const f = await photoFixture(
    {
      after(fn) {
        cleanup = fn;
      },
    },
    {
      "All mail.mbox":
        "From sender@example.test Sat Jan 01 00:00:00 2022\nFrom: sender@example.test\nSubject: <img src=x onerror=alert(1)>\nX-Gmail-Labels: Inbox,Family\n\nOriginal body\n",
    },
    "Gmail",
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
        .filter({ hasText: "Gmail" })
        .click();
    };
    await open();
    await page
      .getByRole("button", { name: "Review mail inventory", exact: true })
      .click();
    const section = page.getByRole("region", { name: "Mail inventory" });
    await expect(section.getByRole("status")).toHaveText(
      "Mailboxes checked: 1 · Message candidates: 1 · Unreadable or changed: 0",
    );
    await section.getByText("Mailbox details (up to 20 files)").click();
    await expect(
      section.getByText("<img src=x onerror=alert(1)> · byte 0", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(section.locator("img")).toHaveCount(0);
    await expect(
      section.getByText("Labels as exported: Inbox,Family", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 420, height: 850 });
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../test-results/migrate-mail-review.png",
      ),
      fullPage: true,
    });
    await f.restart();
    await page.reload();
    await open();
    await expect(section.getByRole("status")).toContainText(
      "Message candidates: 1",
    );
  } finally {
    await cleanup();
  }
});
