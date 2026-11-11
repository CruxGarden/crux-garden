import { ServiceIcon } from "./ServiceIcon";
import { useEffect, useState } from "react";
import Panel from "@cruxgarden/garden-ui/components/ui/Panel";
import Button from "@cruxgarden/garden-ui/components/ui/Button";
import PlasmaMaterial from "@cruxgarden/garden-ui/components/plasma/PlasmaMaterial";
import PlasmaSurfaces from "@cruxgarden/garden-ui/components/plasma/PlasmaSurfaces";
import { GARDEN_DARK } from "@cruxgarden/garden-ui/lib/moods/garden-dark";
import { MIGRATION_MOOD, applyMigrationMood } from "./mood";
import type { MigrationClient } from "@cruxgarden/migration-contracts";
import type {
  MigrationInfo,
  MigrationJob,
} from "@cruxgarden/migration-contracts";
import { MIGRATION_GUIDES, findGuide } from "@cruxgarden/migration-providers";
import MigrationGuide from "./MigrationGuide";
import Downloads from "./Downloads";
import CloudServices from "./CloudServices";
import PhotoReview from "./PhotoReview";
import MailReview from "./MailReview";
import "./migration.css";

const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`;

export default function MigrationApp({
  client,
  appearance = "embedded",
  hostNotice = "Local preview · no account required",
}: {
  client: MigrationClient;
  hostNotice?: string;
  appearance?: "standalone" | "embedded";
}) {
  const [page, setPage] = useState<
    "together" | "migration" | "mood" | "downloads" | "cloud"
  >("together");
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasCloud, setHasCloud] = useState(false);
  const [hasDownloads, setHasDownloads] = useState(false);
  const [hasFileSelection, setHasFileSelection] = useState(false);
  const [mailInventory, setMailInventory] = useState(false);
  const [photoProviders, setPhotoProviders] = useState<string[]>([]);
  const [mood, setMood] = useState<Record<string, string>>({});
  const [tokenFilter, setTokenFilter] = useState("");
  const [provider, setProvider] = useState("Dropbox");
  const [providerFilter, setProviderFilter] = useState("");
  const job = jobs.find((j) => j.id === selected);
  const guide = findGuide(job?.provider || provider)!;
  const filteredGuides = MIGRATION_GUIDES.filter((g) =>
    `${g.name} ${g.category}`
      .toLowerCase()
      .includes(providerFilter.toLowerCase()),
  );
  async function refresh() {
    setJobs(await client.request<MigrationJob[]>("list"));
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const info = await client.request<MigrationInfo>("info");
        if (disposed) return;
        setMood(info.mood);
        setHasCloud(!!info.capabilities?.cloudCollections);
        setHasDownloads(!!info.capabilities?.sharedFileDownloads);
        setHasFileSelection(!!info.capabilities?.localFileSelection);
        setMailInventory(!!info.capabilities?.mailInventory);
        setPhotoProviders(
          info.capabilities?.photoMetadataProviders ||
            (info.capabilities?.photoMetadata ? ["Flickr"] : []),
        );
        if (appearance === "standalone") applyMigrationMood(info.mood);
        await refresh();
        setReady(true);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const interval = setInterval(() => {
      if (!disposed) void refresh().catch(() => {});
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [client, appearance]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (appearance === "standalone") applyMigrationMood(mood);
    };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mood, appearance]);
  function chooseProvider() {
    setSelected(undefined);
    setPage("migration");
  }
  async function newImport() {
    const created = await client.request<MigrationJob>("create", { provider });
    setSelected(created.id);
    setPage("migration");
  }
  async function saveMood(next: Record<string, string>) {
    await client.request("mood", { tokens: next });
    setMood(next);
    if (appearance === "standalone") applyMigrationMood(next);
  }
  const content = (
    <div className="migration-area">
      <header className="migration-header">
        <div>
          <p className="migration-eyebrow">crux garden</p>
          <h1>Migrate</h1>
        </div>
        <nav aria-label="Migrate">
          {hasCloud && (
            <Button
              variant={page === "cloud" ? "primary" : "ghost"}
              onClick={() => setPage("cloud")}
            >
              Cloud services
            </Button>
          )}
          {hasDownloads && (
            <Button
              variant={page === "downloads" ? "primary" : "ghost"}
              onClick={() => setPage("downloads")}
            >
              Downloads
            </Button>
          )}
          <Button
            variant={page === "together" ? "primary" : "ghost"}
            onClick={() => setPage("together")}
          >
            Overview
          </Button>
          <Button
            variant={page === "migration" ? "primary" : "ghost"}
            onClick={() => setPage("migration")}
          >
            Migrate
          </Button>
          <Button
            variant={page === "mood" ? "primary" : "ghost"}
            onClick={() => setPage("mood")}
          >
            Mood
          </Button>
        </nav>
      </header>
      <main>
        {page === "cloud" && (
          <CloudServices
            client={client}
            onImport={(job) => {
              setJobs((previous) => [
                ...previous.filter((j) => j.id !== job.id),
                job,
              ]);
              setSelected(job.id);
              setProvider(job.provider);
              setPage("migration");
            }}
          />
        )}
        {page === "downloads" && (
          <Downloads
            client={client}
            onImport={(job) => {
              setSelected(job.id);
              setPage("migration");
              void refresh();
            }}
          />
        )}
        {error && (
          <Panel className="mb-6" role="alert">
            <strong>Something needs attention</strong>
            <p>{error}</p>
          </Panel>
        )}
        {page === "together" && (
          <div className="migration-grid">
            <Panel className="migration-welcome" padding="lg">
              <p className="migration-eyebrow">your digital life, together</p>
              <h2>Bring what matters home.</h2>
              <p>
                Your photographs, documents, and memories deserve a place of
                their own. Start by bringing a copy here.
              </p>
              <Button
                size="lg"
                disabled={!ready || busy}
                onClick={chooseProvider}
              >
                Bring files home <span aria-hidden>↗</span>
              </Button>
              <p className="migration-footnote">
                On your computer. Yours to keep.
              </p>
            </Panel>
            <div className="migration-stack">
              <Panel padding="lg">
                <p className="migration-eyebrow">preserve and verify</p>
                <h2>Migrate</h2>
                <p>
                  Follow an export guide, preserve your files, and check every
                  copy.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setPage("migration")}
                >
                  Open Migrate
                </Button>
              </Panel>
              <Panel padding="lg">
                <p className="migration-eyebrow">a fresh start</p>
                <h3>Room for your digital life.</h3>
                <p>
                  No sample projects or bundled applications. Choose the files
                  you want to keep.
                </p>
              </Panel>
            </div>
          </div>
        )}
        {page === "migration" && (
          <>
            <div className="migration-section-heading">
              <div>
                <p className="migration-eyebrow">bring it home</p>
                <h2>Migrate</h2>
              </div>
              <Button disabled={!ready || busy} onClick={chooseProvider}>
                New import
              </Button>
            </div>
            <div className="migration-grid">
              <Panel padding="lg">
                {!job ? (
                  <>
                    <p className="migration-eyebrow">
                      {MIGRATION_GUIDES.length} export guides · available
                      offline
                    </p>
                    <h3>Where are your files today?</h3>
                    <p>
                      Choose a service for its export instructions. Migrate can
                      preserve a downloaded folder, ZIP, TAR or TAR.GZ and
                      verify the local copy.
                    </p>
                    <label>
                      Find a service
                      <input
                        type="search"
                        value={providerFilter}
                        onChange={(event) =>
                          setProviderFilter(event.target.value)
                        }
                        placeholder="Photos, Google, notes…"
                      />
                    </label>
                    <div
                      className="migration-provider-list"
                      aria-label="Services to migrate"
                    >
                      {filteredGuides.map((g) => (
                        <Button
                          key={g.id}
                          variant={
                            provider === g.name ? "primary" : "secondary"
                          }
                          aria-pressed={provider === g.name}
                          onClick={() => setProvider(g.name)}
                        >
                          <ServiceIcon service={g.name} />
                          {g.name}
                        </Button>
                      ))}
                      {!filteredGuides.length && (
                        <p>No matching services. Try a broader search.</p>
                      )}
                    </div>
                    <div className="migration-section-heading">
                      <h3 className="service-title">
                        <ServiceIcon service={guide.name} />
                        {guide.name}
                      </h3>
                      <Button
                        disabled={!ready || busy}
                        onClick={() => void act(newImport)}
                      >
                        Start {guide.name} import
                      </Button>
                    </div>
                    <MigrationGuide
                      guide={guide}
                      busy={busy}
                      onReference={(index) =>
                        void act(() =>
                          client.request("help", { provider, index }),
                        )
                      }
                    />
                  </>
                ) : (
                  <>
                    <p className="migration-eyebrow service-title">
                      <ServiceIcon service={job.provider} />
                      {job.provider} · {job.state}
                    </p>
                    <h3>A copy you can keep.</h3>
                    {guide.scope && <p>{guide.scope}</p>}
                    <details key={job.id}>
                      <summary>
                        How to prepare your {job.provider} export
                      </summary>
                      <MigrationGuide
                        guide={guide}
                        job={job}
                        busy={busy}
                        onCheck={(step, checked) =>
                          void act(() =>
                            client.request("checklist", {
                              id: job.id,
                              step,
                              checked,
                            }),
                          )
                        }
                        onReference={(index) =>
                          void act(() =>
                            client.request("help", {
                              provider: job.provider,
                              index,
                            }),
                          )
                        }
                      />
                    </details>
                    <div className="migration-choice">
                      <span>
                        1. Your downloaded files, folder or archives
                        <small>
                          {job.source ||
                            "Choose the files you want to preserve"}
                        </small>
                      </span>
                      <Button
                        variant="secondary"
                        disabled={
                          busy || !!job.output || job.state === "inspecting"
                        }
                        onClick={() =>
                          void act(() => client.pick(job.id, "source"))
                        }
                      >
                        Choose source
                      </Button>
                      {hasFileSelection && (
                        <Button
                          variant="secondary"
                          disabled={
                            busy || !!job.output || job.state === "inspecting"
                          }
                          onClick={() =>
                            void act(() => client.pick(job.id, "fileSet"))
                          }
                        >
                          Choose files
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={
                          busy || !!job.output || job.state === "inspecting"
                        }
                        onClick={() =>
                          void act(() => client.pick(job.id, "archive"))
                        }
                      >
                        Choose archive
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          busy || !!job.output || job.state === "inspecting"
                        }
                        onClick={() =>
                          void act(() => client.pick(job.id, "archiveSet"))
                        }
                      >
                        Choose export parts
                      </Button>
                    </div>
                    {job.sourceFiles && (
                      <details className="migration-export-parts" open>
                        <summary>
                          {job.sourceFiles.length} files selected
                        </summary>
                        <ul>
                          {job.sourceFiles.map((file) => (
                            <li key={file}>{file}</li>
                          ))}
                        </ul>
                        <p>
                          Only these files will be copied. Select any companion
                          video, XMP or JSON files you want to keep too.
                          Archives selected here stay intact; use Choose export
                          parts to unpack them.
                        </p>
                      </details>
                    )}
                    {job.sourceArchives && (
                      <details className="migration-export-parts" open>
                        <summary>
                          {job.sourceArchives.length} export{" "}
                          {job.sourceArchives.length === 1 ? "part" : "parts"}{" "}
                          selected
                        </summary>
                        <ul>
                          {job.sourceArchives.map((part) => (
                            <li key={part}>{part}</li>
                          ))}
                        </ul>
                        <p>
                          Each original archive is kept. Its files stay in a
                          separate folder named after that part, so repeated
                          names cannot overwrite one another. Check that you
                          selected every part supplied by your service.
                        </p>
                      </details>
                    )}
                    <div className="migration-choice">
                      <span>
                        2. A place to keep your copy
                        <small>
                          {job.destination ||
                            "Choose a separate folder on a supported drive"}
                        </small>
                      </span>
                      <Button
                        variant="secondary"
                        disabled={
                          busy || !!job.output || job.state === "inspecting"
                        }
                        onClick={() =>
                          void act(() => client.pick(job.id, "destination"))
                        }
                      >
                        Choose destination
                      </Button>
                    </div>
                    {!job.output && (
                      <div className="migration-choice">
                        <span>
                          3. Review your files
                          <small>
                            {job.inspection
                              ? `${job.inspection.files} ${job.inspection.files === 1 ? "file" : "files"} · ${size(job.inspection.bytes)} to preserve · ${size(job.inspection.requiredBytes)} space needed · ${size(job.inspection.availableBytes)} available`
                              : "Check the files and available space before copying."}
                          </small>
                        </span>
                        <Button
                          variant="secondary"
                          disabled={
                            busy ||
                            !job.source ||
                            !job.destination ||
                            job.state === "inspecting"
                          }
                          onClick={() =>
                            void act(() =>
                              client.request("inspect", { id: job.id }),
                            )
                          }
                        >
                          {job.state === "inspecting"
                            ? "Reviewing…"
                            : "Review files"}
                        </Button>
                      </div>
                    )}
                    <div className="migration-choice">
                      <span>
                        4. Preserve and verify
                        <small>
                          {job.files} {job.files === 1 ? "file" : "files"}{" "}
                          checked · {size(job.bytes)}
                        </small>
                      </span>
                      {job.state === "running" || job.state === "inspecting" ? (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              client.request("pause", { id: job.id }),
                            )
                          }
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          disabled={
                            busy ||
                            !job.source ||
                            !job.destination ||
                            !job.inspection
                          }
                          onClick={() =>
                            void act(() =>
                              client.request("start", { id: job.id }),
                            )
                          }
                        >
                          {job.state === "verified"
                            ? "Verify again"
                            : job.output
                              ? "Resume import"
                              : "Preserve files"}
                        </Button>
                      )}
                    </div>
                    <p role="status" aria-live="polite">
                      {job.state === "verified"
                        ? "Your files are preserved and verified."
                        : job.state === "inspecting"
                          ? "Reviewing your export…"
                          : job.current ||
                            "Your originals stay where they are."}
                    </p>
                    {job.inspection && !job.output && (
                      <p className="migration-footnote">
                        Allow extra space for temporary files and the report.
                        Source changes require another review. An empty folder
                        will produce a report with no copied files.
                      </p>
                    )}
                    {job.error && <p role="alert">{job.error}</p>}
                    {mailInventory &&
                      job.provider === "Gmail" &&
                      job.output && (
                        <MailReview
                          job={job}
                          busy={busy}
                          run={(command) =>
                            void act(() =>
                              client.request(command, { id: job.id }),
                            )
                          }
                        />
                      )}
                    {photoProviders.includes(job.provider) && job.output && (
                      <PhotoReview
                        job={job}
                        busy={busy}
                        run={(command) =>
                          void act(() =>
                            client.request(command, { id: job.id }),
                          )
                        }
                      />
                    )}
                    {job.output && (
                      <Button
                        variant="secondary"
                        onClick={() => void act(() => client.reveal(job.id))}
                      >
                        Open files and report
                      </Button>
                    )}
                    {job.output && (
                      <p className="migration-footnote">
                        The report records the first successful verification.
                        This import’s status shows the latest check.
                      </p>
                    )}
                  </>
                )}
              </Panel>
              <div className="migration-stack">
                <Panel padding="lg">
                  <h3>Your imports</h3>
                  {jobs.length ? (
                    <ul className="migration-history">
                      {jobs.map((j) => (
                        <li key={j.id}>
                          <Button
                            fullWidth
                            variant={selected === j.id ? "primary" : "ghost"}
                            onClick={() => setSelected(j.id)}
                          >
                            <ServiceIcon service={j.provider} />
                            {j.provider} · {j.state} ·{" "}
                            {new Date(j.created).toLocaleDateString()}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Your saved imports will appear here.</p>
                  )}
                </Panel>
                <Panel padding="lg">
                  <h3>What this preview preserves</h3>
                  <p>
                    Ordinary files, folder paths, and modification dates. Copies
                    are checked with SHA-256 and accompanied by a readable
                    report.
                  </p>
                  <p className="migration-footnote">
                    Folders, ZIP and TAR · up to 20,000 entries / 1 TiB; archive
                    expansion up to 1,000:1. Encrypted ZIPs are not supported.
                    Original archives are kept alongside the extracted files.
                    Empty folders, links, extended attributes, albums, and
                    permissions are not imported. This preview requires a
                    destination with hard-link support, such as APFS or NTFS. A
                    verified copy is not an off-site backup.
                  </p>
                </Panel>
              </div>
            </div>
          </>
        )}
        {page === "mood" && (
          <Panel padding="lg">
            <p className="migration-eyebrow">make it yours</p>
            <h2>Your Migrate Mood</h2>
            <p>
              These are Crux Garden’s shared Mood tokens. Your choices are saved
              on this computer.
            </p>
            <div className="migration-mood-actions">
              <label>
                Material{" "}
                <select
                  value={mood.surfaceStyle || MIGRATION_MOOD.surfaceStyle}
                  onChange={(e) =>
                    void act(() =>
                      saveMood({ ...mood, surfaceStyle: e.target.value }),
                    )
                  }
                >
                  <option value="plasma">Plasma</option>
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                </select>
              </label>
              <label>
                Accent{" "}
                <input
                  type="color"
                  value={mood.accent || MIGRATION_MOOD.accent}
                  onChange={(e) =>
                    void act(() =>
                      saveMood({ ...mood, accent: e.target.value }),
                    )
                  }
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void act(() => saveMood({}))}
              >
                Reset Mood
              </Button>
            </div>
            <details>
              <summary>Customize shared theme tokens</summary>
              <label>
                Find a token{" "}
                <input
                  value={tokenFilter}
                  onChange={(e) => setTokenFilter(e.target.value)}
                  placeholder="panel, font, radius…"
                />
              </label>
              <div className="migration-token-grid">
                {Object.keys(GARDEN_DARK)
                  .filter((k) =>
                    k.toLowerCase().includes(tokenFilter.toLowerCase()),
                  )
                  .slice(0, 60)
                  .map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        key={k + (mood[k] || "")}
                        defaultValue={
                          mood[k] ??
                          MIGRATION_MOOD[k] ??
                          GARDEN_DARK[k as keyof typeof GARDEN_DARK]
                        }
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (/url\s*\(|asset:|@import/i.test(value)) {
                            setError(
                              "This Migrate preview supports theme values, without external assets.",
                            );
                            return;
                          }
                          void act(() => saveMood({ ...mood, [k]: value }));
                        }}
                      />
                    </label>
                  ))}
              </div>
              <p className="migration-footnote">
                Showing up to 60 matching tokens. Asset-based Moods can be added
                in a later milestone.
              </p>
            </details>
          </Panel>
        )}
      </main>
      <footer className="migration-footer">
        <span>Crux Garden Migrate</span>
        <span>{hostNotice}</span>
      </footer>
    </div>
  );
  return appearance === "standalone" ? (
    <PlasmaMaterial>
      <PlasmaSurfaces />
      {content}
    </PlasmaMaterial>
  ) : (
    content
  );
}
