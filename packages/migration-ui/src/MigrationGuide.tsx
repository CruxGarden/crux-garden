import type { MigrationGuide as Guide } from "@cruxgarden/migration-providers";
import type { MigrationJob } from "@cruxgarden/migration-contracts";

export default function MigrationGuide({
  guide,
  job,
  busy,
  onCheck,
  onReference,
}: {
  guide: Guide;
  job?: MigrationJob;
  busy: boolean;
  onCheck?: (step: string, checked: boolean) => void;
  onReference: (index: number) => void;
}) {
  return (
    <div className="migration-guide">
      {guide.provisional && (
        <p className="migration-footnote">
          Account check needed: these menus are changing. Confirm the export
          options in your account; the current help pages could not be fully
          checked.
        </p>
      )}
      {job && (
        <p className="migration-footnote">
          Your checklist is saved with this import.
        </p>
      )}
      <ol>
        {guide.steps.map((step) => (
          <li key={step.id}>
            {job ? (
              <label className="migration-checklist-label">
                <input
                  type="checkbox"
                  checked={job.checklist?.[step.id] || false}
                  disabled={busy}
                  onChange={(event) => onCheck?.(step.id, event.target.checked)}
                />
                {step.label}
              </label>
            ) : (
              <strong>{step.label}</strong>
            )}
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <h4>What to check in your export</h4>
      <p>{guide.checks}</p>
      <p className="migration-footnote">
        Migrate preserves the files you provide. Compare your export with your
        account to check for missing records and attachments. Sharing rules
        and service features are not automatically recreated.
      </p>
      <ul className="migration-guide-sources">
        {guide.sources.map((source, index) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                onReference(index);
              }}
            >
              {source.title} ↗
            </a>
          </li>
        ))}
      </ul>
      <p className="migration-footnote">
        {guide.provisional
          ? "Guidance reviewed"
          : "Official instructions reviewed"}{" "}
        {guide.reviewed}. These instructions are available offline; reference
        links need a connection.
      </p>
    </div>
  );
}
