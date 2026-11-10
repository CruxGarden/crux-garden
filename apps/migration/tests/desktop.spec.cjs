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
