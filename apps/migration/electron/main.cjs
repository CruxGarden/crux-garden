const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { join, resolve, isAbsolute, relative } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mkdirSync, realpathSync } = require("node:fs");

app.setName(
  app.isPackaged
    ? "Crux Garden Migration Electron Preview"
    : "Crux Garden Migration Development",
);
// Test overrides are restricted to development; installed Migration has its own profile.
const testProfile = !app.isPackaged && process.env.CRUX_MIGRATION_TEST_PROFILE;
if (testProfile && !isAbsolute(testProfile))
  throw new Error("The test profile must be absolute.");
const profile = testProfile || join(app.getPath("appData"), app.getName());
mkdirSync(profile, { recursive: true });
app.setPath("userData", realpathSync(profile));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "crux-migration",
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
  let window,
    child,
    ending = false;
  const pending = new Map();
  let sequence = 0;
  const runtime = app.isPackaged
    ? join(process.resourcesPath, "runtime")
    : resolve(__dirname, "../runtime-dist");
  const web = app.isPackaged
    ? join(process.resourcesPath, "home")
    : resolve(__dirname, "../dist");
  function request(command, args = {}) {
    return new Promise((resolveReply, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Migration’s local service did not respond."));
      }, 30000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveReply(value);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      child.stdin.write(JSON.stringify({ id, command, args }) + "\n");
    });
  }
  const isMigrationUrl = (value) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === "crux-migration:" &&
        u.hostname === "app" &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  };
  const trusted = (event) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !isMigrationUrl(event.senderFrame.url)
    )
      throw new Error("This operation belongs to the Migration window.");
  };
  app.whenReady().then(async () => {
    protocol.handle("crux-migration", (req) => {
      const url = new URL(req.url);
      const file = resolve(
        web,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      const rel = relative(web, file);
      if (url.host !== "app" || rel.startsWith("..") || isAbsolute(rel))
        return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    });
    child = spawn(
      join(runtime, "node"),
      [join(runtime, "backend.cjs"), profile],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    child.stdin.on("error", (e) => {
      for (const p of pending.values()) p.reject(e);
      pending.clear();
    });
    child.stderr.on("data", (bytes) => process.stderr.write(bytes));
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const reply = JSON.parse(line);
        const p = pending.get(reply.id);
        if (!p) return;
        pending.delete(reply.id);
        reply.error
          ? p.reject(new Error(reply.error))
          : p.resolve(reply.result);
      } catch {
        for (const p of pending.values())
          p.reject(
            new Error("Invalid response from Migration’s local service."),
          );
        pending.clear();
      }
    });
    child.on("error", (e) => {
      for (const p of pending.values()) p.reject(e);
      pending.clear();
    });
    child.on("exit", () => {
      for (const p of pending.values())
        p.reject(new Error("Migration’s local service stopped."));
      pending.clear();
    });
    ipcMain.handle("migration:request", async (event, command, args) => {
      trusted(event);
      if (command === "help")
        return shell.openExternal(await request("guideLink", args));
      if (
        ![
          "info",
          "list",
          "create",
          "mood",
          "start",
          "pause",
          "inspect",
          "checklist",
        ].includes(command)
      )
        throw new Error("Operation unavailable in Migration.");
      return request(command, args);
    });
    ipcMain.handle("migration:pick", async (event, id, kind) => {
      trusted(event);
      if (!["source", "archive", "destination"].includes(kind))
        throw new Error("Invalid folder choice.");
      const chosen = await dialog.showOpenDialog(window, {
        title:
          kind === "archive"
            ? "Choose your export archive"
            : kind === "source"
              ? "Choose your downloaded export folder"
              : "Choose where to preserve your copy",
        properties:
          kind === "archive"
            ? ["openFile"]
            : ["openDirectory", "createDirectory"],
        ...(kind === "archive"
          ? {
              filters: [
                {
                  name: "Export archive",
                  extensions: ["zip", "tar", "tgz", "gz"],
                },
              ],
            }
          : {}),
      });
      trusted(event);
      if (!chosen.canceled && chosen.filePaths[0])
        await request(kind === "archive" ? "source" : kind, {
          id,
          path: chosen.filePaths[0],
        });
    });
    ipcMain.handle("migration:reveal", async (event, id) => {
      trusted(event);
      const folder = await request("reportPath", { id });
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    });
    window = new BrowserWindow({
      width: 1280,
      height: 900,
      minWidth: 480,
      minHeight: 600,
      title: "Crux Garden Migration",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (!isMigrationUrl(url)) event.preventDefault();
    });
    await window.loadURL("crux-migration://app/index.html");
  });
  app.on("before-quit", (event) => {
    if (!child || child.exitCode !== null) return;
    event.preventDefault();
    if (ending) return;
    ending = true;
    // Complete the service shutdown before exiting the host. Re-entering quit()
    // from the child callback can leave Chromium's close sequence pending.
    const deadline = setTimeout(() => {
      child.kill();
      app.exit(1);
    }, 5000);
    child.once("exit", (code) => {
      clearTimeout(deadline);
      app.exit(code === 0 ? 0 : 1);
    });
    child.stdin.end();
  });
  app.on("window-all-closed", () => app.quit());
}
