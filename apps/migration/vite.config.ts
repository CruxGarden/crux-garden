import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { cpSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
const root = path.resolve(__dirname, "../..");
export default defineConfig({
  root: __dirname,
  publicDir: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "migration-resources",
      generateBundle(_, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== "chunk") continue;
          for (const module of Object.keys(output.modules))
            if (
              /\/packages\/migration-engine\/|\/[^/]+-crux\/|monaco-editor|better-sqlite3/.test(
                module,
              )
            )
              this.error(
                `Backend or authoring dependency reached the UI: ${module}`,
              );
        }
      },
      closeBundle() {
        const out = path.join(__dirname, "dist");
        cpSync(
          path.join(root, "packages/garden-ui/fonts"),
          path.join(out, "fonts"),
          { recursive: true },
        );
        copyFileSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
        writeFileSync(
          path.join(out, "service-icons-NOTICES.txt"),
          [
            "docs/service-icons.md",
            "docs/dashboard-icons-LICENSE.txt",
            "docs/simple-icons-LICENSE.txt",
            "packages/migration-ui/src/assets/services/sources.json",
          ]
            .map((file) => readFileSync(path.join(root, file), "utf8"))
            .join("\n\n"),
        );
        for (const name of ["react", "react-dom", "@cruxgarden/plasma-ui"])
          copyFileSync(
            path.join(root, "node_modules", name, "LICENSE"),
            path.join(out, name.replaceAll("/", "-") + "-LICENSE"),
          );
      },
    },
  ],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
