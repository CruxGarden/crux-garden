module.exports = {
  testDir: __dirname,
  testMatch: "embedding.spec.cjs",
  outputDir: "../../test-results/embedding",
  timeout: 30000,
  use: { channel: "chrome" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --config tests/embedding/vite.config.ts",
    cwd: require("node:path").resolve(__dirname, "../.."),
    url: "http://127.0.0.1:5189/tests/embedding/",
    reuseExistingServer: false,
  },
};
