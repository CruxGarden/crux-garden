const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const exec = promisify(require("node:child_process").execFile);
const {
  createMigrationRuntime,
  photosAdapter,
} = require("../dist/backend.cjs");
const { PhotosBridge } = require("../dist/photos-bridge.cjs");
exports.photosHostFixture = async function () {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-photo-ui-"));
  const binary = path.join(dir, "fixture");
  await exec("xcrun", [
    "swiftc",
    "-swift-version",
    "5",
    "-D",
    "PHOTOKIT_FIXTURE",
    "-framework",
    "Photos",
    "-target",
    `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`,
    "-O",
    path.resolve(__dirname, "../native/photos/main.swift"),
    "-o",
    binary,
  ]);
  let permission = "authorized",
    cancel = false;
  const grants = [];
  const runtime = await createMigrationRuntime(path.join(dir, "profile"), {
    cloud: {
      photosFactory: async (signal, grant) => {
        grants.push({ ...grant });
        const bridge = new PhotosBridge(binary);
        await bridge.request("fixtureSet", { permission });
        return photosAdapter(bridge, grant, signal);
      },
    },
  });
  return {
    dir,
    grants,
    call: (...args) => runtime.request(...args),
    set permission(value) {
      permission = value;
    },
    set cancel(value) {
      cancel = value;
    },
    connect: (options) =>
      cancel
        ? Promise.resolve(null)
        : runtime.connectPhotos({
            sourceBinding: "fixture-ui-library",
            networkAllowed: options.networkAllowed,
          }),
    async close() {
      await runtime.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
};
