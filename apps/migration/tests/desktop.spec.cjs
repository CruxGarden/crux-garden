const {
  test,
  expect,
  _electron: electron,
} = require("../../../tools/node_modules/@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const zipFixture = require("./zip-fixture.cjs");
test("Migrate opens empty, preserves a folder, changes Mood and retains history", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "crux-migration-desktop-")),
  );
  const source = path.join(dir, "export");
  const dest = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  await fs.writeFile(path.join(source, "memory.txt"), "A memory to keep.");
  const launch = () =>
    electron.launch({
      executablePath: require("../../../tools/node_modules/electron"),
      args: [path.resolve(__dirname, "..")],
      env: {
        ...process.env,
        CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page).toHaveTitle("Crux Garden Migrate");
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({
      timeout: 30000,
    });
    expect(
      await page.evaluate(() => window.migrationAPI.request("info")),
    ).toMatchObject({
      product: "migration",
      cruxCount: 0,
    });
    const blocked = await page.evaluate(() =>
      window.migrationAPI.request("source", { id: "bad", path: "/" }).then(
        () => false,
        () => true,
      ),
    );
    expect(blocked).toBe(true);
    await page.screenshot({
      path: path.join(__dirname, "../test-results/home-together.png"),
    });
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .getByRole("button", { name: "Start Dropbox import", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Choose source" }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, source);
    await page.getByRole("button", { name: "Choose source" }).click();
    await expect(page.getByText(source, { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, dest);
    await page.getByRole("button", { name: "Choose destination" }).click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Review files", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page
      .getByText("How to prepare your Dropbox export", { exact: true })
      .click();
    await page.getByLabel("Download your files", { exact: true }).click();
    await expect(
      page.getByLabel("Download your files", { exact: true }),
    ).toBeChecked();
    await page
      .getByText("How to prepare your Dropbox export", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await page.screenshot({
      path: path.join(__dirname, "../test-results/home-migration.png"),
    });
    await page.getByRole("button", { name: "Mood", exact: true }).click();
    await page.getByLabel("Material").selectOption("glass");
    await expect(page.locator("html")).toHaveAttribute(
      "data-surface-style",
      "glass",
    );
    await page
      .getByText("Customize shared theme tokens", { exact: true })
      .click();
    await page.getByLabel("Find a token", { exact: true }).fill("logoSurface");
    await page.getByLabel("logoSurface", { exact: true }).fill("#f1e6d2");
    await page.getByLabel("logoSurface", { exact: true }).press("Tab");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.migrationAPI.request("info").then((info) => info.mood),
        ),
      )
      .toMatchObject({ logoSurface: "#f1e6d2" });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({
      timeout: 30000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-surface-style",
      "glass",
    );
    await page.getByRole("button", { name: "Migrate", exact: true }).click();
    await expect(page.locator(".service-icon").first()).toHaveCSS(
      "background-color",
      "rgb(241, 230, 210)",
    );

    await expect(
      page.getByRole("button", { name: /Dropbox · verified/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Dropbox · verified/ }).click();
    await page
      .getByText("How to prepare your Dropbox export", { exact: true })
      .click();
    await expect(
      page.getByLabel("Download your files", { exact: true }),
    ).toBeChecked();
    await page.setViewportSize({ width: 560, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await page.evaluate(() => window.migrationAPI.request("info")))
        .cruxCount,
    ).toBe(0);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Migrate selects a ZIP, reviews it and preserves its original and extracted files", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "home-zip-desktop-")),
  );
  const source = path.join(dir, "export.zip");
  const destination = path.join(dir, "copies");
  await fs.mkdir(destination);
  await fs.writeFile(
    source,
    zipFixture([
      { name: "memories/note.txt", data: "Home from a ZIP.", deflate: true },
    ]),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .getByRole("button", { name: "Start Dropbox import", exact: true })
      .click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async (_window, options) => {
        if (!options.properties.includes("openFile"))
          throw new Error("ZIP selection must use the file chooser");
        return { canceled: false, filePaths: [file] };
      };
    }, source);
    await page.getByRole("button", { name: "Choose archive" }).click();
    await expect(page.getByText(source, { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, destination);
    await page.getByRole("button", { name: "Choose destination" }).click();
    await page.getByRole("button", { name: "Review files" }).click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const job = (
      await page.evaluate(() => window.migrationAPI.request("list"))
    )[0];
    expect(
      await fs.readFile(
        path.join(job.output, "files/memories/note.txt"),
        "utf8",
      ),
    ).toBe("Home from a ZIP.");
    expect(
      await fs.readFile(path.join(job.output, "original/export.zip")),
    ).toEqual(await fs.readFile(source));
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("offline catalog filters providers, saves a provider-specific checklist and restricts links", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "home-guides-desktop-")),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({
      timeout: 30000,
    });
    await page.route("https://**/*", (route) => route.abort());
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page.getByLabel("Find a service").fill("Flickr");
    await page.getByRole("button", { name: "Flickr", exact: true }).click();
    await expect(
      page.getByText("Request your full Flickr data", { exact: true }),
    ).toBeVisible();
    await app.evaluate(({ shell }) => {
      global.homeOpenedLinks = [];
      shell.openExternal = async (url) => {
        global.homeOpenedLinks.push(url);
      };
    });
    await page
      .getByRole("link", { name: "Flickr download instructions" })
      .click();
    await expect
      .poll(() => app.evaluate(() => global.homeOpenedLinks))
      .toEqual([
        "https://www.flickrhelp.com/hc/en-us/articles/4404079675156-Downloading-content-from-Flickr",
      ]);
    expect(
      await page.evaluate(() =>
        window.migrationAPI
          .request("help", {
            provider: "Flickr",
            index: -1,
            url: "file:///tmp/private",
          })
          .then(
            () => false,
            () => true,
          ),
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Start Flickr import" }).click();
    await page
      .getByText("How to prepare your Flickr export", { exact: true })
      .click();
    await page
      .getByLabel("Request your full Flickr data", { exact: true })
      .click();
    await expect(
      page.getByLabel("Request your full Flickr data", { exact: true }),
    ).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Migrate", exact: true }).click();
    await page.getByRole("button", { name: /Flickr · ready/ }).click();
    await page
      .getByText("How to prepare your Flickr export", { exact: true })
      .click();
    await expect(
      page.getByLabel("Request your full Flickr data", { exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "New import", exact: true }).click();
    await page.getByLabel("Find a service").fill("no service matches this");
    await expect(
      page.getByText("No matching services. Try a broader search."),
    ).toBeVisible();
    await page.getByLabel("Find a service").fill("");
    await page.getByRole("button", { name: "Facebook", exact: true }).click();
    await expect(page.getByText(/Account check needed:/)).toBeVisible();
    await page.setViewportSize({ width: 560, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await page.evaluate(() => window.migrationAPI.request("info")))
        .cruxCount,
    ).toBe(0);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("closing the window keeps the API and worker alive; explicit quit pauses and restart resumes", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migration-background-")),
  );
  const profile = path.join(dir, "profile");
  const source = path.join(dir, "export");
  const destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  // Enough small files to observe interruption without timing hooks in production.
  const contents = Buffer.alloc(64 * 1024, 42);
  for (let batch = 0; batch < 16; batch++) {
    await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        fs.writeFile(path.join(source, `file-${batch * 32 + i}.bin`), contents),
      ),
    );
  }
  const launch = () =>
    electron.launch({
      executablePath: require("../../../tools/node_modules/electron"),
      args: [path.resolve(__dirname, "..")],
      env: { ...process.env, CRUX_MIGRATION_TEST_PROFILE: profile },
    });
  let app = await launch();
  let connection;
  async function api(route, body) {
    const response = await fetch(connection.url + "/v1/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer " + connection.token,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    expect(response.status, value.error).toBe(200);
    return value.result;
  }
  async function ready() {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({ timeout: 30000 });
    connection = JSON.parse(
      await fs.readFile(path.join(profile, "local-api.json"), "utf8"),
    );
    return page;
  }
  async function preparedJob() {
    const job = await api("jobs", { provider: "Dropbox" });
    await api(`jobs/${job.id}/source`, { path: source });
    await api(`jobs/${job.id}/destination`, { path: destination });
    await api(`jobs/${job.id}/inspect`, {});
    await expect
      .poll(
        async () =>
          (await api("jobs")).find((j) => j.id === job.id).inspection?.files,
        { timeout: 30000 },
      )
      .toBe(512);
    return job;
  }
  try {
    let page = await ready();
    await expect(
      page.getByText(/Closing the window keeps work running/),
    ).toBeVisible();
    const job = await preparedJob();
    const firstConnection = { ...connection };
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(false);
    // Start real work AFTER hiding: completion cannot be a copy that finished first.
    await api(`jobs/${job.id}/start`, {});
    await expect
      .poll(
        async () => (await api("jobs")).find((j) => j.id === job.id).state,
        { timeout: 30000 },
      )
      .toBe("verified");
    expect(
      JSON.parse(
        await fs.readFile(path.join(profile, "local-api.json"), "utf8"),
      ),
    ).toEqual(firstConnection);
    await app.evaluate(({ app }) => app.emit("activate"));
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Migrate", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Dropbox · verified/ }),
    ).toBeVisible();
    const next = await preparedJob();
    await api(`jobs/${next.id}/start`, {});
    await app.close();
    await expect(
      fs.stat(path.join(profile, "local-api.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(profile, "service.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    app = await launch();
    page = await ready();
    expect(connection.token).not.toBe(firstConnection.token);
    const paused = (await api("jobs")).find((j) => j.id === next.id);
    expect(paused.state).toBe("paused");
    await api(`jobs/${next.id}/start`, {});
    await expect
      .poll(
        async () => (await api("jobs")).find((j) => j.id === next.id).state,
        { timeout: 30000 },
      )
      .toBe("verified");
    const verified = (await api("jobs")).find((j) => j.id === next.id);
    expect(await fs.readdir(path.join(verified.output, "files"))).toHaveLength(
      512,
    );
    expect(
      await fs.readFile(path.join(verified.output, "files/file-511.bin")),
    ).toEqual(contents);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Downloads prepares a Dropbox link through the native folder picker without persisting its secret", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-native-download-")),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Downloads", exact: true }).click();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, dir);
    await page
      .getByLabel("Dropbox file link")
      .fill("https://www.dropbox.com/s/id/example.bin?rlkey=private-test-link");
    await page
      .getByRole("button", { name: "Prepare download", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start download", exact: true }),
    ).toBeEnabled();
    const jobs = await page.evaluate(() =>
      window.migrationAPI.request("downloads"),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].folder).toContain(dir);
    expect(JSON.stringify(jobs)).not.toContain("private-test-link");
    expect(
      await page.evaluate(() =>
        window.migrationAPI
          .request("downloadDestination", { id: "x", path: "/" })
          .then(
            () => false,
            () => true,
          ),
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 560, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cloud selection starts empty, exposes Google setup and retains native path authority", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-cloud-desktop-")),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Cloud services", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Choose what to bring home" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Bluesky handle", { exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("combobox", { name: "Service", exact: true })
      .selectOption("Google Drive");
    await page
      .getByText("One-time Google connection setup", { exact: true })
      .click();
    await expect(page.getByText(/application type/)).toBeVisible();
    const blocked = await page.evaluate(() =>
      Promise.all(
        ["cloudDestination", "cloudScanDirectory"].map((command) =>
          window.migrationAPI.request(command, { id: "bad", path: "/" }).then(
            () => false,
            () => true,
          ),
        ),
      ),
    );
    expect(blocked).toEqual([true, true]);
    await page
      .getByRole("combobox", { name: "Service", exact: true })
      .selectOption("Amazon S3");
    await page.getByLabel("Bucket", { exact: true }).fill("fixture-bucket");
    await page
      .getByLabel("AWS region", { exact: true })
      .fill("http://localhost");
    await page
      .getByRole("button", { name: "Connect Amazon S3", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "commercial AWS region",
    );
    await page.setViewportSize({ width: 420, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("multiple export parts use native selection, stay separate and fit a narrow window", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-parts-desktop-")),
  );
  const source = path.join(dir, "exports"),
    destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const parts = ["part-1.zip", "part-2.zip"].map((name) =>
    path.join(source, name),
  );
  for (let i = 0; i < parts.length; i++)
    await fs.writeFile(
      parts[i],
      zipFixture([
        { name: "photo.txt", data: `Photo ${i}` },
        i === 0
          ? {
              name: "photo_101.json",
              data: JSON.stringify({ id: "101", name: "Summer fixture" }),
            }
          : { name: "101_abcdef_o.jpg", data: "Synthetic photo" },
      ]),
    );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Bring files home" }),
    ).toBeEnabled({ timeout: 30000 });
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page.getByRole("button", { name: "Flickr", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Flickr import", exact: true })
      .click();
    expect(
      await page.evaluate(() =>
        window.migrationAPI
          .request("archiveSet", { id: "bad", paths: ["/"] })
          .then(
            () => false,
            () => true,
          ),
      ),
    ).toBe(true);
    await app.evaluate(({ dialog }, parts) => {
      dialog.showOpenDialog = async (_window, options) => {
        if (
          !options.properties.includes("multiSelections") ||
          !options.properties.includes("openFile")
        )
          throw new Error("Expected native multiple-file selection");
        return { canceled: false, filePaths: parts };
      };
    }, parts);
    await page.getByRole("button", { name: "Choose export parts" }).click();
    await expect(
      page.getByText("2 export parts selected", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("part-1.zip", { exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(500, 800),
    );
    await expect(
      page.getByRole("button", { name: "Choose export parts" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // A row's horizontal label basis must not become a tall spacer in column layout.
    expect(
      await page
        .locator(".migration-choice > span")
        .evaluateAll((labels) =>
          labels.every((label) => label.getBoundingClientRect().height < 160),
        ),
    ).toBe(true);
    // Plasma coalesces native resize events before reallocating its drawing buffer.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector("canvas.plasma-ground");
          return (
            !canvas ||
            Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) <
              0.01
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: path.join(__dirname, "../test-results/export-parts-narrow.png"),
      fullPage: false,
    });
    await app.evaluate(({ dialog }, destination) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [destination],
      });
    }, destination);
    await page.getByRole("button", { name: "Choose destination" }).click();
    await page
      .getByRole("button", { name: "Review files", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preserve files", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Preserve files", exact: true })
      .click();
    await expect(
      page.getByText("Your files are preserved and verified.", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    for (let i = 0; i < parts.length; i++)
      expect(
        await fs.readFile(
          path.join(job.output, "files", path.basename(parts[i]), "photo.txt"),
          "utf8",
        ),
      ).toBe(`Photo ${i}`);
    await page
      .getByRole("button", { name: "Review photo metadata", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Photo metadata review" })
        .getByRole("status"),
    ).toContainText("1 matched · 0 ambiguous");
    await page.reload();
    await expect
      .poll(
        async () =>
          await page.evaluate(() => window.migrationAPI.request("list")),
      )
      .toMatchObject([
        {
          sourceKind: "archive-set",
          state: "verified",
          sourceArchives: ["part-1.zip", "part-2.zip"],
        },
      ]);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Dropbox native host opens only its constructed OAuth URL and disconnect releases the callback", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-dropbox-desktop-")),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    await app.evaluate(({ shell }) => {
      global.dropboxOpened = [];
      shell.openExternal = async (url) => {
        global.dropboxOpened.push(url);
      };
    });
    const page = await app.firstWindow();
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
    for (let i = 0; i < 2; i++) {
      await page
        .getByLabel("Dropbox app key", { exact: true })
        .fill("fixtureAppKey");
      await page
        .getByRole("button", { name: "Connect Dropbox", exact: true })
        .click();
      await expect(
        page.getByText(
          "Complete the Dropbox connection in your browser, then return here.",
        ),
      ).toBeVisible();
      await expect(
        page.getByLabel("Dropbox app key", { exact: true }),
      ).toHaveValue("");
      const opened = await app.evaluate(() => global.dropboxOpened);
      expect(opened).toHaveLength(i + 1);
      const url = new URL(opened.at(-1));
      expect(url.origin).toBe("https://www.dropbox.com");
      expect(url.pathname).toBe("/oauth2/authorize");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://127.0.0.1:53683/callback/dropbox",
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(
        await page.evaluate(() => window.migrationAPI.request("cloudStatus")),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ authorizationUrl: expect.any(String) }),
        ]),
      );
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(
        page.getByText(
          "Complete the Dropbox connection in your browser, then return here.",
        ),
      ).toHaveCount(0);
    }
    await page.setViewportSize({ width: 420, height: 850 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    // Plasma coalesces native resize events before reallocating its drawing buffer.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector("canvas.plasma-ground");
          return (
            !canvas ||
            Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) <
              0.01
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../test-results/migrate-dropbox-setup.png",
      ),
    });
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Google Photos Takeout metadata review is available through the native shared workflow", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-takeout-desktop-")),
  );
  const source = path.join(dir, "source"),
    destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(source, "photo.jpg"), "synthetic image bytes");
  await fs.writeFile(
    path.join(source, "photo.jpg.supplemental-metadata.json"),
    JSON.stringify({
      title: "photo.jpg",
      photoTakenTime: { timestamp: "123" },
    }),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .getByRole("button", { name: "Google Photos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start Google Photos import", exact: true })
      .click();
    for (const [label, folder] of [
      ["Choose source", source],
      ["Choose destination", destination],
    ]) {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, folder);
      await page.getByRole("button", { name: label, exact: true }).click();
    }
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
      page.getByRole("button", { name: "Review photo metadata", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Review photo metadata", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Photo metadata review" })
        .getByRole("status"),
    ).toContainText("1 matched · 0 ambiguous");
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    expect(job.photoReview.counts.matched).toBe(1);
    const report = JSON.parse(
      await fs.readFile(path.join(job.output, job.photoReview.report), "utf8"),
    );
    expect(report.adapter).toBe("google-photos-takeout-v1");
    expect(report.records[0].exportedTime.timestamp).toBe("123");
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("selected downloaded files use a native grant and exclude unselected siblings", async () => {
  const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "migrate-file-pick-")),
    ),
    source = path.join(dir, "source"),
    dest = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  const names = ["IMG_01.HEIC", "IMG_01.MOV", "IMG_01.xmp"];
  for (const name of [...names, "excluded.txt"])
    await fs.writeFile(path.join(source, name), "synthetic " + name);
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .getByRole("button", { name: "iCloud Photos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start iCloud Photos import", exact: true })
      .click();
    expect(
      await page.evaluate(async () => {
        try {
          await window.migrationAPI.request("fileSet", {
            id: "bad",
            paths: ["/"],
          });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async (_w, options) => {
          if (
            !options.properties.includes("multiSelections") ||
            options.filters
          )
            throw new Error("Expected unrestricted multi-file picker");
          return { canceled: false, filePaths: paths };
        };
      },
      names.map((n) => path.join(source, n)),
    );
    await page
      .getByRole("button", { name: "Choose files", exact: true })
      .click();
    await expect(
      page.getByText("3 files selected", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Only these files will be copied.", { exact: false }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, dest) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [dest],
      });
    }, dest);
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
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    expect(job.sourceFiles).toEqual(names.sort());
    expect((await fs.readdir(path.join(job.output, "files"))).sort()).toEqual(
      names.sort(),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(500, 850),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page
      .locator(".migration-history button")
      .filter({ hasText: "iCloud Photos" })
      .click();
    await expect(
      page.getByText("3 files selected", { exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Gmail mail inventory runs through native picker authority and preserves raw messages", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-mail-desktop-")),
  );
  const source = path.join(dir, "source"),
    destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const raw =
    "From sender@example.test Sat Jan 01 00:00:00 2022\nFrom: sender@example.test\nSubject: Synthetic mail\nX-Gmail-Labels: Inbox\n\nBody stays unchanged\n";
  await fs.writeFile(path.join(source, "all.mbox"), raw);
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page.getByRole("button", { name: "Gmail", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Gmail import", exact: true })
      .click();
    for (const [label, folder] of [
      ["Choose source", source],
      ["Choose destination", destination],
    ]) {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, folder);
      await page.getByRole("button", { name: label, exact: true }).click();
    }
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
      page.getByRole("button", { name: "Review mail inventory", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Review mail inventory", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Mail inventory" }).getByRole("status"),
    ).toContainText("Mailboxes checked: 1 · Message candidates: 1");
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    expect(job.mailReview.counts.candidates).toBe(1);
    const report = JSON.parse(
      await fs.readFile(path.join(job.output, job.mailReview.report), "utf8"),
    );
    expect(report.adapter).toBe("mbox-inventory-v1");
    expect(
      await fs.readFile(path.join(job.output, "files/all.mbox"), "utf8"),
    ).toBe(raw);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Gmail native host opens only its constructed OAuth URL and disconnect releases the callback", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-gmail-desktop-")),
  );
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    await app.evaluate(({ shell }) => {
      global.gmailOpened = [];
      shell.openExternal = async (url) => {
        global.gmailOpened.push(url);
      };
    });
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Cloud services", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Service", exact: true })
      .selectOption("Gmail");
    await page
      .getByText("One-time Google connection setup", { exact: true })
      .click();
    for (let i = 0; i < 2; i++) {
      await page
        .getByLabel("Google desktop client ID", { exact: true })
        .fill("fixture.apps.googleusercontent.com");
      await page
        .getByRole("button", { name: "Connect Gmail", exact: true })
        .click();
      await expect(
        page.getByText(
          "Complete the Gmail connection in your browser, then return here.",
        ),
      ).toBeVisible();
      await expect(
        page.getByLabel("Google desktop client ID", { exact: true }),
      ).toHaveValue("");
      const opened = await app.evaluate(() => global.gmailOpened);
      expect(opened).toHaveLength(i + 1);
      const url = new URL(opened.at(-1));
      expect(url.origin).toBe("https://accounts.google.com");
      expect(url.pathname).toBe("/o/oauth2/v2/auth");
      expect(url.searchParams.get("redirect_uri")).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
      );
      expect(url.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/gmail.readonly",
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(
        await page.evaluate(() => window.migrationAPI.request("cloudStatus")),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ authorizationUrl: expect.any(String) }),
        ]),
      );
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(
        page.getByText(
          "Complete the Gmail connection in your browser, then return here.",
        ),
      ).toHaveCount(0);
    }
    await page.setViewportSize({ width: 420, height: 850 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    // Plasma coalesces native resize events before reallocating its drawing buffer.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector("canvas.plasma-ground");
          return (
            !canvas ||
            Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) <
              0.01
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../test-results/migrate-gmail-setup.png",
      ),
    });
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

for (const variant of ["entries", "labeledEntries"]) {
  test(`Instagram ${variant} export references run through native picker authority and preserve original files`, async () => {
    const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "migrate-instagram-desktop-")),
    );
    const source = path.join(dir, "source"),
      destination = path.join(dir, "copies");
    await fs.mkdir(source);
    await fs.mkdir(destination);
    const {
      [variant]: entries,
    } = require("../../../packages/migration-engine/tests/instagram-fixture.cjs");
    for (const [name, bytes] of Object.entries(entries)) {
      await fs.mkdir(path.dirname(path.join(source, name)), {
        recursive: true,
      });
      await fs.writeFile(path.join(source, name), bytes);
    }
    const app = await electron.launch({
      executablePath: require("../../../tools/node_modules/electron"),
      args: [path.resolve(__dirname, "..")],
      env: {
        ...process.env,
        CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
      },
    });
    try {
      const page = await app.firstWindow();
      await page.getByRole("button", { name: "Bring files home" }).click();
      await page
        .getByRole("button", { name: "Instagram", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Start Instagram import", exact: true })
        .click();
      for (const [label, folder] of [
        ["Choose source", source],
        ["Choose destination", destination],
      ]) {
        await app.evaluate(({ dialog }, folder) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [folder],
          });
        }, folder);
        await page.getByRole("button", { name: label, exact: true }).click();
      }
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
        page.getByRole("button", { name: "Review export media", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Review export media", exact: true })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Export media review" })
          .getByRole("status"),
      ).toContainText(
        "1 matched · 0 ambiguous · 1 unmatched · 1 unreadable or unrecognized",
      );
      const [job] = await page.evaluate(() =>
        window.migrationAPI.request("list"),
      );
      expect(job.photoReview.counts.matched).toBe(1);
      const report = JSON.parse(
        await fs.readFile(
          path.join(job.output, job.photoReview.report),
          "utf8",
        ),
      );
      expect(report.adapter).toBe("instagram-post-media-v3");
      for (const [name, bytes] of Object.entries(entries))
        expect(
          await fs.readFile(path.join(job.output, "files", name), "utf8"),
        ).toBe(bytes);
    } finally {
      await app.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test("Facebook export references run through native picker authority and preserve original files", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-facebook-desktop-")),
  );
  const source = path.join(dir, "source"),
    destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const {
    entries,
  } = require("../../../packages/migration-engine/tests/facebook-fixture.cjs");
  for (const [name, bytes] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await fs.writeFile(path.join(source, name), bytes);
  }
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page.getByRole("button", { name: "Facebook", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Facebook import", exact: true })
      .click();
    for (const [label, folder] of [
      ["Choose source", source],
      ["Choose destination", destination],
    ]) {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, folder);
      await page.getByRole("button", { name: label, exact: true }).click();
    }
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
      page.getByRole("button", { name: "Review export media", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Review export media", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Export media review" })
        .getByRole("status"),
    ).toContainText(
      "1 matched · 0 ambiguous · 1 unmatched · 1 unreadable or unrecognized",
    );
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    expect(job.photoReview.counts.matched).toBe(1);
    const report = JSON.parse(
      await fs.readFile(path.join(job.output, job.photoReview.report), "utf8"),
    );
    expect(report.adapter).toBe("facebook-numbered-post-media-v2");
    for (const [name, bytes] of Object.entries(entries))
      expect(
        await fs.readFile(path.join(job.output, "files", name), "utf8"),
      ).toBe(bytes);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("X export references run through native picker authority and preserve original files", async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "migrate-x-desktop-")),
  );
  const source = path.join(dir, "source"),
    destination = path.join(dir, "copies");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  const {
    playbackEntries: entries,
  } = require("../../../packages/migration-engine/tests/x-fixture.cjs");
  for (const [name, bytes] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await fs.writeFile(path.join(source, name), bytes);
  }
  const app = await electron.launch({
    executablePath: require("../../../tools/node_modules/electron"),
    args: [path.resolve(__dirname, "..")],
    env: {
      ...process.env,
      CRUX_MIGRATION_TEST_PROFILE: path.join(dir, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Bring files home" }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page
      .getByRole("button", { name: "Start X import", exact: true })
      .click();
    for (const [label, folder] of [
      ["Choose source", source],
      ["Choose destination", destination],
    ]) {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, folder);
      await page.getByRole("button", { name: label, exact: true }).click();
    }
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
      page.getByRole("button", { name: "Review export media", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Review export media", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Export media review" })
        .getByRole("status"),
    ).toContainText(
      "2 matched · 0 ambiguous · 1 unmatched · 0 unreadable or unrecognized",
    );
    const [job] = await page.evaluate(() =>
      window.migrationAPI.request("list"),
    );
    expect(job.photoReview.counts.matched).toBe(2);
    const report = JSON.parse(
      await fs.readFile(path.join(job.output, job.photoReview.report), "utf8"),
    );
    expect(report.adapter).toBe("x-archive-media-reference-v2");
    for (const [name, bytes] of Object.entries(entries))
      expect(
        await fs.readFile(path.join(job.output, "files", name), "utf8"),
      ).toBe(bytes);
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
