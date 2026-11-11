import { request } from "node:https";
import { resolve4 } from "node:dns/promises";
import { BlockList } from "node:net";
import type { IncomingMessage } from "node:http";
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
  options?: { method: "POST"; body?: string },
) => Promise<IncomingMessage>;
/** Resolve and pin a public IPv4 address, retaining TLS hostname verification. */
export const openHttps: DownloadOpen = async (
  url,
  headers,
  signal,
  options,
) => {
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
    const req = request(
      url,
      {
        headers,
        method: options?.method ?? "GET",
        signal,
        family: 4,
        lookup: (_host, _options, callback) => callback(null, addresses[0]!, 4),
      },
      resolve,
    );
    req.setTimeout(30_000, () => req.destroy(new Error("Download timed out.")));
    req.once("error", reject);
    req.end(options?.body);
  });
};
