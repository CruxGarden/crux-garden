import { parentPort, workerData } from "node:worker_threads";
import { compareLocalFiles } from "./local-comparison";
import type { Fingerprint } from "./cloud/fingerprints";
const port = parentPort!;
const abort = new AbortController();
let pending:
  | { resolve: (files: Fingerprint[]) => void; reject: (error: Error) => void }
  | undefined;
port.on("message", (message) => {
  if (message === "pause") {
    abort.abort();
    pending?.reject(new Error("Comparison paused."));
  } else if (message?.type === "candidates") {
    if (message.error)
      pending?.reject(
        new Error("Catalog lookup failed. Retry the comparison."),
      );
    else pending?.resolve(message.files);
    pending = undefined;
  }
});
void compareLocalFiles(
  workerData.source,
  workerData.selected,
  (sha256, bytes) =>
    new Promise((resolve, reject) => {
      abort.signal.throwIfAborted();
      pending = { resolve, reject };
      port.postMessage({ type: "candidates", sha256, bytes });
    }),
  abort.signal,
  (checked) =>
    port.postMessage({
      state: "running",
      checked,
      total: workerData.selected.length,
    }),
)
  .then((result) => port.postMessage(result))
  .catch((error) => {
    port.postMessage({
      state: abort.signal.aborted ? "paused" : "failed",
      error: abort.signal.aborted
        ? "Comparison paused. Retry starts from the beginning."
        : error.message,
    });
  })
  .finally(() => port.close());
