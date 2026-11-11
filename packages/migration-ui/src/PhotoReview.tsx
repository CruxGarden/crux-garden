import Button from "@cruxgarden/garden-ui/components/ui/Button";
import type { MigrationJob } from "@cruxgarden/migration-contracts";

export default function PhotoReview({
  job,
  busy,
  run,
}: {
  job: MigrationJob;
  busy: boolean;
  run: (command: "photoReview" | "pause") => void;
}) {
  const review = job.photoReview;
  const running = review?.state === "running";
  return (
    <section
      className="migration-photo-review"
      aria-label="Photo metadata review"
    >
      <h3>Photo metadata</h3>
      <p>
        Review photo details and albums in the Flickr export parts you selected.
        Your originals stay intact.
      </p>
      <Button
        disabled={busy || (!running && job.state !== "verified")}
        variant="secondary"
        onClick={() => run(running ? "pause" : "photoReview")}
      >
        {running ? "Pause metadata review" : "Review photo metadata"}
      </Button>
      {running && (
        <p role="status">
          Reviewing metadata… {review.checked || 0} of {review.total ?? "…"}
        </p>
      )}
      {review?.error && <p role="alert">{review.error}</p>}
      {review?.state === "complete" && review.counts && (
        <>
          <p role="status">
            {review.counts.matched} matched · {review.counts.ambiguous}{" "}
            ambiguous · {review.counts.unmatched} unmatched ·{" "}
            {review.counts.invalid} unreadable or unrecognized
          </p>
          <p>
            {review.unassociatedMedia} recognized media files have no photo
            record. Counts cover only the selected export parts.
          </p>
          {!review.total && (
            <p>
              No supported Flickr sidecars found. Include the full-data metadata
              export alongside your media parts.
            </p>
          )}
          <p className="migration-footnote">
            These are suggested links by Flickr ID. Media bytes have not been
            checked again; use Verify again for that. Dates keep their original
            text. This review does not change photo dates or create album
            folders.
          </p>
          {!!review.preview?.length && (
            <details>
              <summary>Review records (up to 50, problems first)</summary>
              <ul>
                {review.preview.map((record, index) => (
                  <li key={index}>
                    <strong>
                      {record.title || record.id || "Unrecognized record"}
                    </strong>{" "}
                    — {record.kind}, {record.status}
                    <div>{record.path}</div>
                    {record.dateTaken && (
                      <div>Date taken: {record.dateTaken} (as exported)</div>
                    )}
                    {record.issue && <div>{record.issue}</div>}
                    {record.memberCount !== undefined && (
                      <div>{record.memberCount} album references</div>
                    )}
                    {record.candidates.map((path) => (
                      <div key={path}>Candidate: {path}</div>
                    ))}
                    {record.candidateCount > record.candidates.length && (
                      <div>More candidates in the report.</div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="migration-footnote">
            Full review saved beside your preservation report: {review.report}.
            Open files and report to see every record. Unknown fields and full
            text remain in the original JSON files.
          </p>
        </>
      )}
    </section>
  );
}
