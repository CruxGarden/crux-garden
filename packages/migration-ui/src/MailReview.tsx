import Button from "@cruxgarden/garden-ui/components/ui/Button";
import type { MigrationJob } from "@cruxgarden/migration-contracts";
export default function MailReview({
  job,
  busy,
  run,
}: {
  job: MigrationJob;
  busy: boolean;
  run: (command: "mailReview" | "pause") => void;
}) {
  const review = job.mailReview;
  const running = review?.state === "running";
  return (
    <section className="migration-photo-review" aria-label="Mail inventory">
      <h3>Mail inventory</h3>
      <p>
        Review Takeout mailbox files (MBOX). This inventory does not interpret
        individual EML files from account downloads. Messages and attachments
        stay together in the original mailbox; message bodies are not displayed.
      </p>
      <Button
        variant="secondary"
        disabled={busy || (!running && job.state !== "verified")}
        onClick={() => run(running ? "pause" : "mailReview")}
      >
        {running ? "Pause mail review" : "Review mail inventory"}
      </Button>
      {running && (
        <p role="status">
          Checking mail… {((review.bytesChecked || 0) / 1e6).toFixed(1)} of{" "}
          {((review.totalBytes || 0) / 1e6).toFixed(1)} MB
        </p>
      )}
      {review?.error && <p role="alert">{review.error}</p>}
      {review?.state === "complete" && review.counts && (
        <>
          <p role="status">
            Mailboxes checked: {review.counts.checked} · Message candidates:{" "}
            {review.counts.candidates} · Unreadable or changed:{" "}
            {review.counts.invalid}
          </p>
          <p>
            Candidates with Gmail label headers: {review.counts.labelHeaders}.
            Format warnings: {review.counts.warnings}.
          </p>
          {!review.total && (
            <p>
              No .mbox files found in this selection. Preserve the Mail export
              files, including all downloaded parts.
            </p>
          )}
          <p className="migration-footnote">
            Counts are provisional: mailbox separators can also occur in message
            text. They are not conversation counts or proof that your account
            export is complete. Bodies and attachments are preserved but are not
            parsed or counted. Labels below remain raw header values.
          </p>
          {!!review.preview?.length && (
            <details>
              <summary>Mailbox details (up to 20 files)</summary>
              <ul>
                {review.preview.map((file) => (
                  <li key={file.path}>
                    <strong>{file.path}</strong> — {file.status}
                    {file.issue && <div>{file.issue}</div>}
                    {file.preamble && (
                      <div>
                        Content before the first separator was not interpreted.
                      </div>
                    )}
                    {file.preview?.map((message, i) => (
                      <div key={i}>
                        <p>
                          {message.subject || "No subject preview"} · byte{" "}
                          {message.offset}
                        </p>
                        {message.labels?.map((label, j) => (
                          <div key={j}>Labels as exported: {label}</div>
                        ))}
                        {message.issue && <div>{message.issue}</div>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="migration-footnote">
            Separate report: {review.report}. It includes up to 50 header
            previews per mailbox and 200 overall, with text shortened to 512
            characters. All original text remains in the MBOX files. Pause/retry
            starts the review again; it does not restart preservation.
          </p>
        </>
      )}
    </section>
  );
}
