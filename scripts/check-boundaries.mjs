import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(path.join(dir, e.name))
          : path.join(dir, e.name),
      ),
    )
  ).flat();
}
for (const pkg of [
  "migration-contracts",
  "migration-providers",
  "garden-ui",
  "migration-ui",
]) {
  for (const file of await files(`packages/${pkg}/src`)) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const source = await readFile(file, "utf8");
    if (
      /from\s+['"](?:node:|.*engine|.*apps\/)|require\(|__TAURI__|window\.migrationAPI/.test(
        source,
      )
    )
      throw new Error(`Host dependency in reusable package: ${file}`);
  }
}
console.log("Reusable packages do not depend on native hosts or the engine.");
