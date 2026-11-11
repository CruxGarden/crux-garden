import { ServiceIcon } from "./ServiceIcon";
import { useEffect, useState } from "react";
import type {
  CloudConnection,
  CloudEntry,
  CloudJobSummary,
  CloudProvider,
  MigrationClient,
  MigrationJob,
} from "@cruxgarden/migration-contracts";
import Panel from "@cruxgarden/garden-ui/components/ui/Panel";
import Button from "@cruxgarden/garden-ui/components/ui/Button";
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
interface Listing {
  entries: CloudEntry[];
  cursor?: string;
  folder?: CloudEntry;
  notes: string[];
}
export default function CloudServices({
  client,
  onImport,
}: {
  client: MigrationClient;
  onImport: (job: MigrationJob) => void;
}) {
  const [provider, setProvider] = useState<CloudProvider>("Bluesky");
  const [fields, setFields] = useState<Record<string, string>>({
    region: "us-east-1",
  });
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [connection, setConnection] = useState("");
  const [jobs, setJobs] = useState<CloudJobSummary[]>([]);
  const [listing, setListing] = useState<Listing>();
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Map<string, CloudEntry>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = connections.find((c) => c.id === connection);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const [cs, js] = await Promise.all([
          client.request<CloudConnection[]>("cloudStatus"),
          client.request<CloudJobSummary[]>("cloudJobs"),
        ]);
        if (!disposed) {
          setConnections(cs);
          setJobs(js);
        }
      } catch {
        if (!disposed)
          setError(
            "Could not read cloud progress. Reopen this view to reconnect.",
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
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setConnections(await client.request("cloudStatus"));
      setJobs(await client.request("cloudJobs"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "This operation needs attention.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function browse(id: string, nextTrail: typeof trail, more = false) {
    const page = await client.request<Listing>("cloudBrowse", {
      connection: id,
      parent: nextTrail.at(-1)?.id ?? "",
      ...(more ? { cursor: listing?.cursor } : {}),
    });
    setListing(
      more && listing
        ? { ...page, entries: [...listing.entries, ...page.entries] }
        : page,
    );
    setTrail(nextTrail);
  }
  function toggle(entry: CloudEntry) {
    setSelected((old) => {
      const next = new Map(old);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.set(entry.id, entry);
      return next;
    });
  }
  function field(key: string, label: string, secret = false, optional = false) {
    return (
      <label className="migration-field" key={key}>
        {label}
        {optional ? " (optional)" : ""}
        <input
          type={secret ? "password" : "text"}
          value={fields[key] ?? ""}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
        />
      </label>
    );
  }
  return (
    <section aria-label="Cloud services">
      <Panel padding="lg">
        <h2>Choose what to bring home</h2>
        <p>
          Connect a service, browse its contents, then select files or entire
          folders. Nothing is selected automatically.
        </p>
        <label className="migration-field">
          Service
          <span className="service-picker">
            <ServiceIcon service={provider} />
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as CloudProvider);
                setFields({ region: "us-east-1" });
              }}
            >
              <option>Bluesky</option>
              <option>Amazon S3</option>
              <option>Google Drive</option>
              <option>Dropbox</option>
            </select>
          </span>
        </label>
        {provider === "Bluesky" && (
          <>
            {field("handle", "Bluesky handle")}
            <p>
              Exports your public records and media. No password needed. Private
              messages and preferences are not included.
            </p>
          </>
        )}
        {provider === "Amazon S3" && (
          <>
            {field("bucket", "Bucket")}
            {field("region", "AWS region")}
            {field("accessKeyId", "Access key ID")}
            {field("secretAccessKey", "Secret access key", true)}
            {field("sessionToken", "Session token", true, true)}
            <p>
              Use credentials with ListBucket and GetObject access to the chosen
              bucket; temporary credentials are supported. Nothing is uploaded
              or deleted. AWS requests and downloads may incur charges.
            </p>
          </>
        )}
        {provider === "Google Drive" && (
          <>
            <details>
              <summary>One-time Google connection setup</summary>
              <ol>
                <li>
                  In Google Cloud Console, create or choose a project and enable
                  the Google Drive API.
                </li>
                <li>
                  Configure Google Auth Platform: app name, audience and your
                  own Google account as a test user while testing.
                </li>
                <li>
                  Create an OAuth client with application type{" "}
                  <strong>Desktop app</strong>. Copy its client ID and client
                  secret into the fields below.
                </li>
                <li>
                  Choose Connect Google Drive and approve read-only Drive access
                  in your normal browser. Return here and browse the connected
                  account.
                </li>
              </ol>
              <p>
                Public distribution will require an appropriate Google
                verification process. This preview uses your own client
                registration.
              </p>
            </details>
            {field("clientId", "Google desktop client ID")}
            {field("clientSecret", "Google desktop client secret", true, true)}
          </>
        )}
        {provider === "Dropbox" && (
          <>
            <details>
              <summary>One-time Dropbox connection setup</summary>
              <ol>
                <li>
                  Create a scoped app in the Dropbox developer console with Full
                  Dropbox access.
                </li>
                <li>
                  Enable only files.metadata.read, files.content.read and
                  account_info.read.
                </li>
                <li>
                  Register this exact redirect URI:{" "}
                  <code>http://127.0.0.1:53683/callback/dropbox</code>
                </li>
                <li>
                  Enter its app key below, then choose Connect Dropbox. Approve
                  read access in your normal browser.
                </li>
              </ol>
              <p>
                No app secret is needed. This preview uses your own
                registration. Another pending Dropbox connection must finish or
                be disconnected before this callback port can be reused.
              </p>
            </details>
            {field("clientId", "Dropbox app key")}
            <p>
              Select files and folders from your Dropbox home. Team-space roots,
              history, comments and cloud documents requiring export are not
              included. Existing shared links can still be used under Downloads.
            </p>
          </>
        )}
        <Button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const c = await client.request<CloudConnection>(
                provider === "Google Drive" || provider === "Dropbox"
                  ? "cloudAuthorize"
                  : "cloudConnect",
                { ...fields, provider },
              );
              setConnection(c.id);
              setListing(undefined);
              setTrail([]);
              setSelected(new Map());
              setFields({ region: "us-east-1" });
              if (c.state === "connected") await browse(c.id, []);
            })
          }
        >
          Connect {provider}
        </Button>
        <p>
          Credentials are held in memory only. Reconnect after quitting; saved
          selections and completed-file checkpoints remain on this computer.
        </p>
        {error && <p role="alert">{error}</p>}
      </Panel>
      {connections.length > 0 && (
        <Panel padding="lg" className="mt-6">
          <label className="migration-field">
            Connected source
            <select
              value={connection}
              onChange={(e) => {
                setConnection(e.target.value);
                setListing(undefined);
                setTrail([]);
                setSelected(new Map());
              }}
            >
              <option value="">Choose a connection</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.provider} · {c.label} · {c.state}
                </option>
              ))}
            </select>
          </label>
          {current?.state === "connecting" && (
            <p role="status">
              Complete the {current.provider} connection in your browser, then
              return here.
            </p>
          )}
          {current?.error && <p role="alert">{current.error}</p>}
          <Button
            disabled={busy || current?.state !== "connected"}
            onClick={() => void act(() => browse(connection, []))}
          >
            Browse source
          </Button>{" "}
          <Button
            variant="secondary"
            disabled={busy || !current}
            onClick={() =>
              void act(async () => {
                await client.request("cloudDisconnect", { connection });
                setConnection("");
                setListing(undefined);
                setSelected(new Map());
              })
            }
          >
            Disconnect
          </Button>
          {listing && (
            <>
              <p>{[current?.label, ...trail.map((v) => v.name)].join(" / ")}</p>
              {trail.length > 0 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(() => browse(connection, trail.slice(0, -1)))
                  }
                >
                  Back to parent folder
                </Button>
              )}
              {listing.folder && (
                <label className="cloud-choice">
                  <input
                    type="checkbox"
                    checked={selected.has(listing.folder.id)}
                    onChange={() => toggle(listing.folder!)}
                  />
                  Select this entire folder: {listing.folder.name}
                </label>
              )}
              <ul className="cloud-entries" aria-label="Files and folders">
                {listing.entries.map((entry) => (
                  <li key={entry.id}>
                    <label className="cloud-choice">
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggle(entry)}
                      />
                      <span>
                        {entry.name}
                        {entry.kind === "folder"
                          ? " (folder)"
                          : entry.size !== undefined
                            ? ` · ${mb(entry.size)}`
                            : ""}
                      </span>
                    </label>
                    {entry.kind === "folder" &&
                      current?.provider !== "Bluesky" && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          aria-label={`Open ${entry.name}`}
                          onClick={() =>
                            void act(() =>
                              browse(connection, [
                                ...trail,
                                { id: entry.id, name: entry.name },
                              ]),
                            )
                          }
                        >
                          Open folder
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
              {!listing.entries.length && <p>This folder is empty.</p>}
              {listing.cursor && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(() => browse(connection, trail, true))
                  }
                >
                  Load more files
                </Button>
              )}
              <p>
                {selected.size} selection{selected.size === 1 ? "" : "s"}.
                Selected folders include all their descendants, including files
                not currently shown.
              </p>
              {selected.size > 0 && (
                <details open>
                  <summary>Review selected items</summary>
                  <ul>
                    {[...selected.values()].map((v) => (
                      <li key={v.id}>
                        {v.name}
                        {v.kind === "folder" ? " — entire folder" : ""}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(new Map())}
                  >
                    Clear selection
                  </Button>
                </details>
              )}
              <details>
                <summary>What this method includes</summary>
                {listing.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </details>
              <Button
                disabled={busy || !selected.size}
                onClick={() =>
                  void act(async () => {
                    const j = await client.request<CloudJobSummary>(
                      "cloudCreate",
                      { connection, selected: [...selected.keys()] },
                    );
                    await client.pick(j.id, "cloudDestination");
                    setSelected(new Map());
                  })
                }
              >
                Prepare selected migration
              </Button>
            </>
          )}
        </Panel>
      )}
      {jobs.map((job) => (
        <Panel key={job.id} padding="lg" className="mt-6">
          <h3 className="service-title">
            <ServiceIcon service={job.provider} />
            {job.provider} · {job.label}
          </h3>
          <p>
            {job.state === "downloaded"
              ? "Downloaded and checked — ready to preserve"
              : job.state}{" "}
            · {job.files} / {job.totalFiles} files · {mb(job.bytes)} completed ·{" "}
            {job.reusedFiles ?? 0} reused locally
          </p>
          <p>{job.selection.map((v) => v.name).join(", ")}</p>
          <p>{job.folder ?? "Choose a local destination."}</p>
          {job.current && <p role="status">{job.current}</p>}
          {job.error && <p role="alert">{job.error}</p>}
          {!job.folder && (
            <Button
              disabled={busy}
              onClick={() =>
                void act(() => client.pick(job.id, "cloudDestination"))
              }
            >
              Choose cloud destination
            </Button>
          )}
          {["discovering", "scanning", "downloading"].includes(job.state) ? (
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await client.request("cloudPause", { id: job.id });
                })
              }
            >
              Pause migration
            </Button>
          ) : job.state !== "downloaded" ? (
            <Button
              disabled={
                busy ||
                !job.folder ||
                current?.state !== "connected" ||
                current?.provider !== job.provider
              }
              onClick={() =>
                void act(async () => {
                  await client.request("cloudStart", {
                    id: job.id,
                    connection,
                  });
                })
              }
            >
              {job.state === "ready"
                ? "Start selected migration"
                : "Resume selected migration"}
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  onImport(
                    await client.request<MigrationJob>("cloudImport", {
                      id: job.id,
                    }),
                  );
                })
              }
            >
              Review cloud export
            </Button>
          )}
          {job.folder &&
            !["discovering", "scanning", "downloading", "downloaded"].includes(
              job.state,
            ) && (
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  current?.state !== "connected" ||
                  current.provider !== job.provider
                }
                onClick={() =>
                  void act(() =>
                    client.pick(job.id, "cloudScanDirectory", { connection }),
                  )
                }
              >
                Compare with local folder
              </Button>
            )}
          {job.comparison && (
            <p role="status">
              Local comparison: {job.comparison.scanned} files scanned ·{" "}
              {job.comparison.matching} verified matches ·{" "}
              {job.comparison.needsDownload} need downloading ·{" "}
              {job.comparison.uncertain} cannot be matched confidently yet.
              Checked {new Date(job.comparison.checkedAt).toLocaleString()}.
              Matches may include other previously indexed folders.
            </p>
          )}
          <p>
            Verified local matches are reused to avoid repeat downloads. Each
            export remains a separate complete copy; existing files are never
            deleted.
          </p>
          <details>
            <summary>Scope and recovery</summary>
            {job.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </details>
        </Panel>
      ))}
    </section>
  );
}
