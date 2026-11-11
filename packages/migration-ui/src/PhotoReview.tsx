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
  const social = ["Instagram", "Facebook", "X"].includes(job.provider);
  const review = job.photoReview;
  const running = review?.state === "running";
  return (
    <section
      className="migration-photo-review"
      aria-label={social ? "Export media review" : "Photo metadata review"}
    >
      <h3>{social ? "Export media references" : "Photo metadata"}</h3>
      <p>
        {social
          ? `Check supported ${job.provider} post media references against your selected files. Counts cover references and unsupported entries, not posts or account completeness.`
          : `Review photo details and albums in the ${job.provider} export parts you selected.`}{" "}
        Your originals stay intact.
      </p>
      <Button
        disabled={busy || (!running && job.state !== "verified")}
        variant="secondary"
        onClick={() => run(running ? "pause" : "photoReview")}
      >
        {running
          ? "Pause metadata review"
          : social
            ? "Review export media"
            : "Review photo metadata"}
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
            {social
              ? "Only supported post data is interpreted. Other files stay preserved."
              : `${review.unassociatedMedia} recognized media files have no photo record.`}{" "}
            Counts cover only the selected export parts.
          </p>
          {!review.total && (
            <p>
              No supported {job.provider} sidecars found. Include the full-data
              metadata export alongside your media parts.{" "}
              {social &&
                (job.provider === "X"
                  ? "This version recognizes data/tweets.js, data/tweet.js and numbered parts with matching archive wrappers."
                  : job.provider === "Facebook"
                    ? "This version recognizes the older posts/your_posts_N.json layout only."
                    : "This version recognizes your_instagram_activity/media/posts_N.json only.")}
            </p>
          )}
          <p className="migration-footnote">
            These are suggested links{" "}
            {job.provider === "Flickr"
              ? "by Flickr ID"
              : social
                ? job.provider === "X"
                  ? "by exact post IDs and observed archive photo names"
                  : "by literal exported local paths"
                : "by Takeout names and exported folders"}
            . Media bytes have not been checked again; use Verify again for
            that.{" "}
            {social
              ? "Exported timestamps remain in the separate report without date correction. References do not prove that media are playable or complete."
              : "Dates keep their original text. This review does not change photo dates or create album folders."}
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
                    {record.reference && (
                      <div>Reference: {record.reference}</div>
                    )}
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
            text remain in the original export files.
          </p>
        </>
      )}
    </section>
  );
}
