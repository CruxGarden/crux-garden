import { parentPort, workerData } from "node:worker_threads";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { checkedPath, exclusiveJson } from "./files";
import { readPreservationReceipt } from "./review-files";
import { mboxInventory } from "./mbox";

let paused = false;
parentPort!.on("message", () => {
  paused = true;
});
const stop = () => {
  if (paused) throw new Error("Mail review paused. Run it again when ready.");
};
async function run() {
  const { id, output, provider } = workerData;
  const { receiptBytes, files } = await readPreservationReceipt(
    output,
    id,
    provider,
    stop,
  );
  const mailboxes = files.filter((f) => /\.mbox$/i.test(f.path));
  if (mailboxes.length > 1000)
    throw new Error("Select at most 1,000 mailbox files per review.");
  const results: Array<
    {
      path: string;
      status: string;
      issue?: string;
      sha256?: string;
      bytes?: number;
    } & Partial<ReturnType<ReturnType<typeof mboxInventory>["finish"]>>
  > = [];
  let previewBudget = 200;
  let bytesChecked = 0,
    lastProgress = 0;
  const totalBytes = mailboxes.reduce((n, f) => n + f.size, 0);
  if (!Number.isSafeInteger(totalBytes))
    throw new Error("Mailbox selection is too large.");
  for (const file of mailboxes) {
    stop();
    try {
      const name = await checkedPath(join(output, "files"), file.path);
      const before = await fs.lstat(name);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.size !== file.size
      )
        throw new Error(
          "Mailbox differs from its preservation receipt or is not a regular file.",
        );
      const handle = await fs.open(
        name,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const parser = mboxInventory();
      const hash = createHash("sha256");
      try {
        const initial = await handle.stat();
        if (
          !initial.isFile() ||
          initial.ino !== before.ino ||
          initial.dev !== before.dev ||
          initial.size !== file.size
        )
          throw new Error("Mailbox changed while opening.");
        const buffer = Buffer.alloc(64 * 1024);
        let used = 0;
        while (used < file.size) {
          stop();
          const { bytesRead } = await handle.read(
            buffer,
            0,
            Math.min(buffer.length, file.size - used),
            null,
          );
          if (!bytesRead)
            throw new Error("Mailbox ended before its recorded size.");
          const bytes = buffer.subarray(0, bytesRead);
          hash.update(bytes);
          parser.push(bytes);
          used += bytesRead;
          bytesChecked += bytesRead;
          if (Date.now() - lastProgress > 150) {
            parentPort!.postMessage({
              state: "running",
              checked: results.length,
              total: mailboxes.length,
              bytesChecked,
              totalBytes,
            });
            lastProgress = Date.now();
          }
        }
        const final = await handle.stat();
        const current = await fs.lstat(name);
        if (
          final.size !== initial.size ||
          final.mtimeMs !== initial.mtimeMs ||
          final.ctimeMs !== initial.ctimeMs ||
          current.ino !== initial.ino ||
          current.dev !== initial.dev ||
          current.isSymbolicLink() ||
          hash.digest("hex") !== file.sha256
        )
          throw new Error(
            "Mailbox changed or differs from its preservation fingerprint. Verify the import again.",
          );
        const inventory = parser.finish();
        inventory.preview = inventory.preview.slice(0, previewBudget);
        previewBudget -= inventory.preview.length;
        results.push({
          path: file.path,
          sha256: file.sha256,
          bytes: file.size,
          status: "checked",
          ...inventory,
        });
      } finally {
        await handle.close();
      }
    } catch (e) {
      stop();
      results.push({
        path: file.path,
        status: "invalid",
        issue:
          e instanceof Error ? e.message : "Mailbox could not be reviewed.",
      });
    }
  }
  const counts = {
    mailboxes: mailboxes.length,
    checked: results.filter((r) => r.status === "checked").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    candidates: results.reduce((n, r) => n + (r.candidates || 0), 0),
    warnings: results.reduce(
      (n, r) => n + (r.warnings || 0) + (r.preamble ? 1 : 0),
      0,
    ),
    labelHeaders: results.reduce((n, r) => n + (r.labelHeaders || 0), 0),
  };
  const report = `mail-review-${randomUUID()}.json`;
  stop();
  await exclusiveJson(output, report, {
    version: 1,
    adapter: "mbox-inventory-v1",
    importId: id,
    created: new Date().toISOString(),
    receiptSha256: createHash("sha256").update(receiptBytes).digest("hex"),
    counts,
    results,
    uninterpretedFiles: files
      .filter((f) => !/\.mbox$/i.test(f.path))
      .map((f) => f.path),
    limitations: [
      "Counts are separator-based message candidates, not verified message totals, thread counts or proof of account completeness.",
      "MBOX variants and unescaped From lines can make boundaries ambiguous. Content-Length variants are not interpreted.",
      "At most 50 candidate headers per mailbox and 200 per report are previewed; text is raw, unfolded, limited to 512 characters, and encoded words are not decoded. Label header values are not split into label names.",
      "Bodies, MIME structure and attachments are not parsed, rendered, extracted or counted. Their original bytes stay in the preserved mailbox.",
      "No message-level deduplication, account access, provider export request/download, threading, date interpretation or mailbox rewriting occurs.",
    ],
  });
  parentPort!.postMessage({
    state: "complete",
    checked: mailboxes.length,
    total: mailboxes.length,
    bytesChecked,
    totalBytes,
    counts,
    report,
    preview: [
      ...results.filter((r) => r.status === "invalid"),
      ...results.filter((r) => r.status === "checked"),
    ]
      .slice(0, 20)
      .map((r) => ({ ...r, preview: r.preview?.slice(0, 5) })),
  });
}
run()
  .catch((e) =>
    parentPort!.postMessage({
      state: paused ? "paused" : "failed",
      error: e instanceof Error ? e.message : "Mail review failed.",
    }),
  )
  .finally(() => parentPort!.close());
