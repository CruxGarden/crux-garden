import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { CloudEntry, CloudItem } from "@cruxgarden/migration-contracts";
import { PhotosBridge } from "../photos-bridge";
import { CloudError, type CloudAdapter } from "./common";

type Resource = { item: CloudItem; key: string };
const fail = () =>
  new CloudError(
    "Photos returned invalid or ambiguous resource metadata. Reconnect and select again.",
  );
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value) > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw fail();
  return value;
}
const roles = [
  "unknown",
  "originalPhoto",
  "originalVideo",
  "originalAudio",
  "alternatePhoto",
  "currentPhoto",
  "currentVideo",
  "adjustmentData",
  "adjustmentBasePhoto",
  "originalPairedVideo",
  "currentPairedVideo",
  "adjustmentBasePairedVideo",
  "adjustmentBaseVideo",
];
const roleFor = (type: number) => roles[type] ?? "unknown";
const roleLabels: Record<string, string> = {
  unknown: "Other resource",
  originalPhoto: "Original photo",
  originalVideo: "Original video",
  originalAudio: "Original audio",
  alternatePhoto: "Alternate photo",
  currentPhoto: "Edited photo",
  currentVideo: "Edited video",
  adjustmentData: "Edit instructions",
  adjustmentBasePhoto: "Editing source photo",
  originalPairedVideo: "Original companion video",
  currentPairedVideo: "Edited companion video",
  adjustmentBasePairedVideo: "Editing source companion video",
  adjustmentBaseVideo: "Editing source video",
};
/** Trusted host constructs this only after permission handling is qualified.
 * Stable namespace and network opt-in come from the host, never raw HTTP/IPC input.
 * No authorization request exists in this adapter or helper.
 */
export async function photosAdapter(
  bridge: PhotosBridge,
  options: { namespace: string; networkAllowed: boolean },
  signal: AbortSignal,
): Promise<CloudAdapter> {
  if (
    typeof options.namespace !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(options.namespace) ||
    typeof options.networkAllowed !== "boolean"
  )
    throw fail();
  // A connection's network choice cannot change through a caller-owned options object.
  options = { ...options };
  const resources = new Map<string, Resource>();
  const assets = new Set<string>();
  const keys = new Set<string>();
  const pages = new Map<string, { entries: CloudEntry[]; cursor?: string }>();
  let next: string | undefined;
  let started = false;
  let closed = false;
  const view = (r: Resource): CloudEntry => ({
    id: r.item.id,
    revision: r.item.revision,
    name: `${r.item.metadata!.originalFilename} · ${roleLabels[String(r.item.metadata!.role)]}`,
    kind: "file",
  });
  async function page(cursor: string | undefined, requestSignal: AbortSignal) {
    requestSignal.throwIfAborted();
    if (closed) throw new CloudError("Reconnect Photos before continuing.");
    const cached = pages.get(cursor ?? "");
    if (cached) return structuredClone(cached);
    if (!started && cursor !== undefined)
      throw new CloudError("Choose the first Photos page.");
    if (started && cursor !== next)
      throw new CloudError("Choose a current Photos page.");
    if (started && next === undefined)
      throw new CloudError("There are no more Photos pages.");
    const result = await bridge.request(
      started ? "page" : "open",
      started ? { cursor } : {},
      requestSignal,
    );
    if (
      !Array.isArray(result.assets) ||
      result.assets.length > 20 ||
      !["authorized", "limited"].includes(String(result.authorization))
    )
      throw fail();
    const following =
      result.cursor === null ? undefined : text(result.cursor, 128);
    if ((following && !result.assets.length) || pages.size >= 1000)
      throw fail();
    if (following && (following === cursor || pages.has(following)))
      throw fail();
    const additions: Resource[] = [];
    const newAssets: string[] = [];
    for (const raw of result.assets) {
      if (!raw || typeof raw !== "object") throw fail();
      const asset = text(raw.asset, 2048);
      const revision = text(raw.revision, 64);
      if (
        !/^[a-f0-9]{64}$/.test(revision) ||
        assets.has(asset) ||
        newAssets.includes(asset) ||
        !Array.isArray(raw.resources) ||
        raw.resources.length > 32
      )
        throw fail();
      newAssets.push(asset);
      const descriptors = new Set<string>();
      for (const [ordinal, r] of raw.resources.entries()) {
        if (
          !r ||
          typeof r !== "object" ||
          !Number.isSafeInteger(r.type) ||
          r.type < 1 ||
          r.type > 10000
        )
          throw fail();
        const name = text(r.filename, 4096),
          uti = text(r.uti, 1024),
          key = text(r.key, 128);
        if (r.role !== roleFor(r.type)) throw fail();
        const signature = JSON.stringify([r.type, name, uti]);
        if (
          descriptors.has(signature) ||
          keys.has(key) ||
          additions.some((v) => v.key === key)
        )
          throw fail();
        descriptors.add(signature);
        const descriptor = [asset, ordinal, r.type, name, uti];
        const resourceHash = hash(descriptor);
        const extension = /\.([a-z0-9]{1,10})$/i.exec(name)?.[1]?.toLowerCase();
        additions.push({
          key,
          item: {
            id: `photos:${resourceHash}`,
            path: `${hash(asset)}/${resourceHash}-${r.role}${extension ? "." + extension : ""}`,
            revision,
            reusePolicy: "checksum-only",
            metadata: {
              assetId: asset,
              resourceOrdinal: ordinal,
              resourceType: r.type,
              role: r.role,
              originalFilename: name,
              uti,
            },
          },
        });
      }
    }
    if (
      assets.size + newAssets.length > 20000 ||
      resources.size + additions.length > 100000
    )
      throw fail();
    for (const asset of newAssets) assets.add(asset);
    for (const r of additions) {
      if (resources.has(r.item.id)) throw fail();
      resources.set(r.item.id, r);
      keys.add(r.key);
    }
    const resultPage = { entries: additions.map(view), cursor: following };
    pages.set(cursor ?? "", resultPage);
    started = true;
    next = following;
    return structuredClone(resultPage);
  }
  async function find(
    id: string,
    revision: string | undefined,
    requestSignal: AbortSignal,
  ) {
    while (!resources.has(id) && (!started || next !== undefined))
      await page(next, requestSignal);
    const r = resources.get(id);
    if (!r || r.item.revision !== revision)
      throw new CloudError(
        "A selected Photos resource changed or is no longer accessible. Create a new selection; existing copies remain intact.",
      );
    return r;
  }
  try {
    const hello = await bridge.request("hello", {}, signal);
    if (hello.protocol !== 1 || hello.authorizationRequests !== false)
      throw fail();
    const status = await bridge.request("status", {}, signal);
    if (!["authorized", "limited"].includes(String(status.authorization)))
      throw new CloudError(
        "Photos access is not available. No permission was requested.",
      );
    return {
      provider: "iCloud Photos",
      identity: `photokit:${options.namespace}`,
      label: "Photos on this Mac",
      notes: [
        "Only explicitly selected resources from the accessible local Photos library are included; this is not a complete iCloud account export.",
        "Originals, current edits, alternate photos and paired videos are separate selections. Hidden assets, all burst members and albums are not included.",
        "Resource sizes are unknown until transfer. Metadata revisions cannot prove content equality; local comparison remains uncertain without a provider content hash.",
        options.networkAllowed
          ? "This connection explicitly permits Photos to retrieve selected resource bytes from iCloud."
          : "Network retrieval is disabled for this connection.",
      ],
      async browse(parent, cursor, requestSignal) {
        if (parent)
          throw new CloudError("Photos album browsing is not implemented.");
        return page(cursor, requestSignal);
      },
      async *discover(selection, requestSignal) {
        for (const entry of selection) {
          if (entry.kind !== "file") throw fail();
          yield structuredClone(
            (await find(entry.id, entry.revision, requestSignal)).item,
          );
        }
      },
      async read(item, requestSignal) {
        const fresh = await find(item.id, item.revision, requestSignal);
        if (
          fresh.item.path !== item.path ||
          JSON.stringify(fresh.item.metadata) !==
            JSON.stringify(item.metadata) ||
          item.reusePolicy !== "checksum-only"
        )
          throw fail();
        const stream = async function* () {
          try {
            yield* bridge.read(
              fresh.key,
              options.networkAllowed,
              requestSignal,
            );
          } catch {
            throw new CloudError(
              "Photos could not finish this resource. Reconnect and retry; unfinished bytes are not published.",
            );
          }
        };
        return { body: Readable.from(stream(), { objectMode: false }) };
      },
      async close() {
        closed = true;
        resources.clear();
        pages.clear();
        assets.clear();
        keys.clear();
        await bridge.close();
      },
    };
  } catch (error) {
    await bridge.close();
    throw error;
  }
}
