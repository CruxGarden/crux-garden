import Button from "@cruxgarden/garden-ui/components/ui/Button";
import type { MigrationJob } from "@cruxgarden/migration-contracts";
export default function LocalComparison({
  job,
  busy,
  run,
}: {
  job: MigrationJob;
  busy: boolean;
  run: (command: "localCompare" | "pause") => void;
}) {
  const result = job.localComparison;
  const running = result?.state === "running";
  return (
    <section className="migration-photo-review" aria-label="Existing copies">
      <h3>Existing copies</h3>
      <p>
        Compare selected files with content Migrate already knows. Matching
        locations are checked again using their current bytes. Preservation
        still copies every selected file.
      </p>
      {!job.output && (
        <Button
          variant="secondary"
          disabled={
            busy ||
            (!running &&
              (job.state === "running" || job.state === "inspecting"))
          }
          onClick={() => run(running ? "pause" : "localCompare")}
        >
          {running ? "Pause comparison" : "Check for existing copies"}
        </Button>
      )}
      {running && (
        <p role="status">
          Checking selected files… {result.checked || 0} of {result.total}
        </p>
      )}
      {result?.error && <p role="alert">{result.error}</p>}
      {result?.state === "complete" && result.counts && (
        <>
          <p role="status">
            Matching files: {result.counts.matched} · No verified match found:{" "}
            {result.counts.notFound}
          </p>
          <p>
            Missing, changed or unreadable candidate locations:{" "}
            {result.counts.unavailableCandidates}. Candidate locations checked:{" "}
            {result.counts.candidatesChecked}.
          </p>
          <p>
            Checked{" "}
            {result.checkedAt
              ? new Date(result.checkedAt).toLocaleString()
              : "previously"}
            . Files may have changed since this check.
          </p>
          <details>
            <summary>Selected file details (up to 50 files)</summary>
            <ul>
              {result.preview?.map((file) => (
                <li key={file.path}>
                  <strong>{file.path}</strong> —{" "}
                  {file.match ? (
                    <>Matching location: {file.match}</>
                  ) : (
                    "No verified match found"
                  )}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p className="migration-footnote">
        Searches up to 20 indexed locations per selected file; other copies may
        exist. A matching path is not proof of an independent backup. Limit: 500
        files, 16 GiB per file and 64 GiB read per check. Pause or retry starts
        the check again. No files are deleted, merged or skipped.
      </p>
    </section>
  );
}
