import { createHash } from "node:crypto";
import { get } from "node:https";
import { resolve4 } from "node:dns/promises";
import { BlockList } from "node:net";
import type { IncomingMessage } from "node:http";
import { safeName } from "../files";

export function dropboxLink(value: unknown) {
  if (typeof value !== "string" || value.length > 8192)
    throw new Error("Paste a Dropbox shared-file link.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Paste a Dropbox shared-file link.");
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !["www.dropbox.com", "dropbox.com"].includes(url.hostname) ||
    !/^\/(s\/[^/]+|scl\/fi\/[^/]+)\/[^/]+$/.test(url.pathname)
  )
    throw new Error(
      "Use a Dropbox shared-file link. Folder and sign-in links are not supported yet.",
    );
  url.hash = "";
  url.searchParams.delete("raw");
  url.searchParams.set("dl", "1");
  // Tracking-only parameters do not change file authority.
  url.searchParams.delete("st");
  url.searchParams.sort();
  const filename = safeName(
    decodeURIComponent(url.pathname.split("/").at(-1)!),
  );
  if (filename.includes("/"))
    throw new Error("The link has an unsafe filename.");
  return {
    url,
    filename,
    linkHash: createHash("sha256").update(url.href).digest("hex"),
  };
}
export function allowedDownloadHost(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    ["dropbox.com", "dropboxusercontent.com"].some(
      (d) => url.hostname === d || url.hostname.endsWith("." + d),
    )
  );
}
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix);
export type DownloadOpen = (
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<IncomingMessage>;
/** Resolve and pin a public IPv4 address, retaining TLS hostname verification. */
const openHttps: DownloadOpen = async (url, headers, signal) => {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Download paused or timed out."));
    if (deadline.aborted) onAbort();
    else deadline.addEventListener("abort", onAbort, { once: true });
  });
  const addresses = await Promise.race([
    resolve4(url.hostname),
    aborted,
  ]).finally(() => deadline.removeEventListener("abort", onAbort));
  if (!addresses.length || addresses.some((a) => blocked.check(a)))
    throw new Error("Download host did not resolve to a public address.");
  if (signal.aborted) throw new Error("Download paused.");
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        headers,
        signal,
        family: 4,
        lookup: (_host, _options, callback) => callback(null, addresses[0]!, 4),
      },
      resolve,
    );
    req.setTimeout(30_000, () => req.destroy(new Error("Download timed out.")));
    req.once("error", reject);
  });
};
export async function downloadResponse(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  open: DownloadOpen = openHttps,
) {
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (!allowedDownloadHost(url))
      throw new Error(
        "Dropbox redirected outside its supported download hosts.",
      );
    const response = await open(
      url,
      { "Accept-Encoding": "identity", ...headers },
      signal,
    );
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = response.headers.location;
      response.destroy();
      if (!location)
        throw new Error("Dropbox returned an incomplete redirect.");
      url = new URL(location, url);
      continue;
    }
    return response;
  }
  throw new Error("Dropbox returned too many redirects.");
}
