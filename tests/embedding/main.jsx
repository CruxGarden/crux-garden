import { createRoot } from "react-dom/client";
import { MigrationApp, applyMigrationMood } from "@cruxgarden/migration-ui";
import "../../apps/migration/styles.css";
applyMigrationMood({ surfaceStyle: "solid", accent: "#123456" });
const jobs = [];
window.hostCalls = [];
const client = {
  async request(command, args = {}) {
    window.hostCalls.push(command);
    if (command === "info")
      return {
        product: "migration",
        cruxCount: 0,
        runtime: "host",
        mood: { accent: "#ff0000" },
      };
    if (command === "list") return structuredClone(jobs);
    if (command === "create") {
      const job = {
        id: "host-job",
        provider: args.provider,
        state: "ready",
        created: new Date().toISOString(),
        files: 0,
        bytes: 0,
      };
      jobs.push(job);
      return job;
    }
    return null;
  },
  async pick(id, kind) {
    window.hostCalls.push("pick:" + id + ":" + kind);
  },
  async reveal(id) {
    window.hostCalls.push("reveal:" + id);
  },
};
createRoot(document.getElementById("root")).render(
  <MigrationApp client={client} />,
);
