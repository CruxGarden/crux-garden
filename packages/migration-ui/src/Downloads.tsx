import { useEffect, useState } from "react";
import type {
  DownloadJob,
  MigrationClient,
  MigrationJob,
} from "@cruxgarden/migration-contracts";
import Panel from "@cruxgarden/garden-ui/components/ui/Panel";
import Button from "@cruxgarden/garden-ui/components/ui/Button";

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export default function Downloads({
  client,
  onImport,
}: {
  client: MigrationClient;
  onImport: (job: MigrationJob) => void;
}) {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const next = await client.request<DownloadJob[]>("downloads");
        if (!disposed) setJobs(next);
      } catch {
        if (!disposed)
          setError(
            "Could not read download progress. Try reopening this view.",
          );
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [client]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setJobs(await client.request<DownloadJob[]>("downloads"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The download needs attention.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Dropbox downloads">
      <Panel padding="lg">
        <h2>Download from Dropbox</h2>
        <p>
          Use an existing shared link to one file that can be downloaded without
          signing in. Folder links and account browsing are not supported yet.
        </p>
        <p>
          The link stays in memory. Paste it again to resume after restarting.
          You do not need to change sharing permissions to use the local export
          tools.
        </p>
        <label className="migration-field">
          Dropbox file link
          <input
            type="url"
            value={link}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.dropbox.com/scl/fi/…"
          />
        </label>
        <Button
          disabled={busy || !link.trim()}
          onClick={() =>
            void act(async () => {
              const job = await client.request<DownloadJob>("downloadCreate", {
                link: link.trim(),
              });
              await client.pick(job.id, "downloadDestination");
            })
          }
        >
          Prepare download
        </Button>
        {error && <p role="alert">{error}</p>}
      </Panel>
      {jobs.length === 0 && <p>No downloads yet.</p>}
      {jobs.map((job) => (
        <Panel key={job.id} padding="lg" className="mt-6">
          <h3>{job.filename}</h3>
          <p>
            {job.state === "downloaded"
              ? "Downloaded — ready to review"
              : job.state}{" "}
            · {size(job.bytes)}
            {job.total !== undefined ? ` of ${size(job.total)}` : ""}
          </p>
          <p>{job.folder || "Choose a local folder for this download."}</p>
          {job.error && <p role="alert">{job.error}</p>}
          {job.total !== undefined &&
            !job.etag &&
            job.state !== "downloaded" && (
              <p>
                Dropbox did not provide a resumable file identity. If
                interrupted, restart this download from the beginning.
              </p>
            )}
          {job.state !== "downloaded" && job.total !== undefined && (
            <progress
              aria-label={`Download progress for ${job.filename}`}
              max={Math.max(job.total, 1)}
              value={job.bytes}
            />
          )}
          {!job.folder && (
            <Button
              disabled={busy}
              onClick={() =>
                void act(() => client.pick(job.id, "downloadDestination"))
              }
            >
              Choose download folder
            </Button>
          )}
          {job.folder &&
            job.state !== "downloading" &&
            job.state !== "downloaded" && (
              <Button
                disabled={busy || !link.trim()}
                onClick={() =>
                  void act(() =>
                    client.request(
                      job.bytes > 0 && !job.etag
                        ? "downloadRestart"
                        : "downloadStart",
                      {
                        id: job.id,
                        link: link.trim(),
                      },
                    ),
                  )
                }
              >
                {job.state === "ready"
                  ? "Start download"
                  : job.bytes > 0 && !job.etag
                    ? "Restart download"
                    : "Resume download"}
              </Button>
            )}
          {job.state === "downloading" && (
            <Button
              disabled={busy}
              onClick={() =>
                void act(() => client.request("downloadPause", { id: job.id }))
              }
            >
              Pause download
            </Button>
          )}
          {job.state === "downloaded" && (
            <>
              <p>
                The file has a local SHA-256 fingerprint. Review and preserve it
                to make a separately verified copy; downloading alone does not
                certify a complete account export.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    onImport(
                      await client.request<MigrationJob>("downloadImport", {
                        id: job.id,
                      }),
                    ),
                  )
                }
              >
                Review downloaded file
              </Button>
            </>
          )}
        </Panel>
      ))}
    </section>
  );
}
