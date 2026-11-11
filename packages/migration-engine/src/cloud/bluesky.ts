import { CID } from "multiformats/cid";
import type { CloudAdapter } from "./common";
import {
  apiUrl,
  CloudError,
  contentSize,
  network,
  publicUrl,
  textField,
} from "./common";
import type { DownloadOpen } from "../network";
export async function bluesky(
  input: Record<string, unknown>,
  signal: AbortSignal,
  open?: DownloadOpen,
): Promise<CloudAdapter> {
  const net = network(open);
  const handle = textField(
    input.handle,
    "your Bluesky handle or DID",
    253,
  ).replace(/^@/, "");
  if (!/^(did:plc:[a-z2-7]{24}|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(handle))
    throw new CloudError(
      "Enter a Bluesky handle or did:plc identity. Other DID methods are not supported in this preview.",
    );
  const did = handle.startsWith("did:")
    ? handle
    : (
        await net.json(
          apiUrl(
            "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle",
            { handle },
          ),
          signal,
        )
      ).did;
  if (typeof did !== "string" || !/^did:plc:[a-z2-7]{24}$/.test(did))
    throw new CloudError(
      "This preview supports Bluesky accounts with did:plc identities.",
    );
  const document = await net.json(
    apiUrl(`https://plc.directory/${did}`),
    signal,
  );
  if (document.id !== did)
    throw new CloudError("The account identity did not match.");
  const endpoint = document.service?.find(
    (s: any) => s.id === "#atproto_pds" || s.id === `${did}#atproto_pds`,
  );
  if (
    endpoint?.type !== "AtprotoPersonalDataServer" ||
    typeof endpoint.serviceEndpoint !== "string"
  )
    throw new CloudError("The account has no supported data server.");
  const pds = publicUrl(endpoint.serviceEndpoint);
  if (pds.pathname !== "/" || pds.search)
    throw new CloudError("Unsupported data-server address.");
  const url = (
    method: string,
    extra: Record<string, string | undefined> = {},
  ) =>
    apiUrl(`${pds.origin}/xrpc/com.atproto.sync.${method}`, { did, ...extra });
  return {
    provider: "Bluesky",
    identity: did,
    label: handle,
    notes: [
      "Public repository CAR and public media blobs only. Private messages, preferences, moderation state and account credentials are not included.",
      "This is a capture over time, not an atomic account snapshot. Keep the original account until you have reviewed the export. CAR is a preservation format, not a readable post viewer.",
    ],
    async browse() {
      return {
        entries: [
          {
            id: "repository",
            name: "Public posts and records (CAR)",
            kind: "file",
          },
          { id: "blobs", name: "All public media blobs", kind: "folder" },
        ],
      };
    },
    async *discover(selection, sig) {
      if (selection.some((s) => s.id === "repository"))
        yield {
          id: "repository",
          path: "repository.car",
          metadata: { did, pds: pds.origin, format: "CAR" },
        };
      if (selection.some((s) => s.id === "blobs")) {
        let cursor: string | undefined;
        const cursors = new Set<string>();
        do {
          const page = await net.json(
            url("listBlobs", { limit: "500", cursor }),
            sig,
          );
          if (!Array.isArray(page.cids))
            throw new CloudError("Invalid media listing.");
          for (const value of page.cids) {
            const cid = CID.parse(value);
            if (
              cid.version !== 1 ||
              cid.code !== 0x55 ||
              cid.multihash.code !== 0x12 ||
              cid.multihash.digest.length !== 32
            )
              throw new CloudError(
                "Unsupported media fingerprint; no unverified media was accepted.",
              );
            yield {
              id: cid.toString(),
              path: `blobs/${cid.toString()}`,
              checksum: {
                algorithm: "sha256" as const,
                hex: Buffer.from(cid.multihash.digest).toString("hex"),
              },
              metadata: { did, cid: cid.toString() },
            };
          }
          cursor = page.cursor;
          if (
            cursor !== undefined &&
            (typeof cursor !== "string" || cursors.has(cursor))
          )
            throw new CloudError("The service repeated its listing cursor.");
          if (cursor) cursors.add(cursor);
        } while (cursor);
      }
    },
    async read(item, sig) {
      const res = await net.response(
        item.id === "repository"
          ? url("getRepo")
          : url("getBlob", { cid: item.id }),
        sig,
      );
      const type = String(res.headers["content-type"]);
      if (type.includes("text/html") || type.includes("application/json")) {
        res.destroy();
        throw new CloudError("The server did not return an export file.");
      }
      return { body: res, size: contentSize(res) };
    },
  };
}
