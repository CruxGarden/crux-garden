const { cp } = require("node:fs/promises");
const path = require("node:path");

// electron-builder filters nested node_modules from extraResources. This is a
// separate Node service, not Electron's dependency graph or native-module ABI.
module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin")
    throw new Error("Home packaging is currently validated on macOS only.");
  const resources = path.join(
    context.appOutDir,
    context.packager.appInfo.productFilename + ".app",
    "Contents/Resources",
  );
  await cp(
    path.resolve(__dirname, "../apps/migration/runtime-dist"),
    path.join(resources, "runtime"),
    {
      recursive: true,
      verbatimSymlinks: true,
    },
  );
};
