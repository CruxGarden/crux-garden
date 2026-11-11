import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cp, mkdir, copyFile, chmod, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const engine = path.join(root, "packages/migration-engine");
const output = path.join(root, "apps/migration/runtime-dist");
await rm(path.join(engine, "dist"), { recursive: true, force: true });
await build({
  entryPoints: [
    "backend",
    "worker",
    "photo-review-worker",
    "photos-bridge",
    "http",
  ].map((name) => path.join(engine, "src", name + ".ts")),
  outdir: path.join(engine, "dist"),
  outExtension: { ".js": ".cjs" },
  platform: "node",
  target: "node22",
  format: "cjs",
  bundle: true,
  external: ["@cruxgarden/local-api", "yauzl", "tar-stream"],
  sourcemap: false,
});
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(engine, "dist"), output, { recursive: true });
await copyFile(
  process.execPath,
  path.join(output, process.platform === "win32" ? "node.exe" : "node"),
);
await chmod(path.join(output, "node"), 0o755);
await copyFile(
  path.resolve(path.dirname(process.execPath), "../LICENSE"),
  path.join(output, "NODE-LICENSE"),
);
await cp(path.join(engine, "node_modules"), path.join(output, "node_modules"), {
  recursive: true,
  verbatimSymlinks: true,
  filter(source) {
    const rel = path
      .relative(path.join(engine, "node_modules"), source)
      .replaceAll("\\", "/");
    if (
      rel.split("/").includes(".bin") ||
      rel.startsWith("@types") ||
      /\.(map|d\.ts)$/.test(rel)
    )
      return false;
    if (/^better-sqlite3\/(src|deps)\//.test(rel)) return false;
    if (
      rel.startsWith("better-sqlite3/build/") &&
      ![
        "better-sqlite3/build/Release",
        "better-sqlite3/build/Release/better_sqlite3.node",
      ].includes(rel)
    )
      return false;
    return true;
  },
});
await copyFile(
  path.join(engine, "package.json"),
  path.join(output, "package.json"),
);
console.log(
  "Migration runtime staged; no Cruxes or authoring application included.",
);

if (process.platform === "darwin") {
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "-swift-version",
      "5",
      "-framework",
      "Photos",
      "-target",
      `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`,
      "-O",
      path.join(engine, "native/photos/main.swift"),
      "-o",
      path.join(output, "photos-helper"),
    ],
    { stdio: "inherit" },
  );
  console.log(
    "PhotoKit helper compiled; connection capability remains disabled.",
  );
}
