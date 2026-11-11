import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import type {
  CloudEntry,
  CloudItem,
  CloudProvider,
} from "@cruxgarden/migration-contracts";
import { openHttps, type DownloadOpen } from "../network";
export class CloudError extends Error {}
export interface CloudAdapter {
  provider: CloudProvider;
  identity: string;
  label: string;
  notes: string[];
  browse(
    parent: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<{ entries: CloudEntry[]; cursor?: string }>;
  discover(
    selection: CloudEntry[],
    signal: AbortSignal,
  ): AsyncIterable<CloudItem>;
  read(
    item: CloudItem,
    signal: AbortSignal,
  ): Promise<{ body: Readable; size?: number }>;
  checksum?(item: CloudItem, signal: AbortSignal): Promise<void>;
  afterRead?(item: CloudItem, signal: AbortSignal): Promise<void>;
  close?(): void;
}
export const message = (e: unknown) =>
  e instanceof CloudError
    ? e.message
    : "Connection interrupted. Reconnect if needed, then retry. Completed files will be checked before they are reused.";
export function textField(value: unknown, label: string, limit = 2048) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > limit ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new CloudError(`Enter ${label}.`);
  return value.trim();
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new CloudError(
      "This service did not supply a supported secure address.",
    );
  return url;
}
export function network(open: DownloadOpen = openHttps) {
  async function response(
    url: URL,
    signal: AbortSignal,
    headers: Record<string, string> = {},
    options?: { method: "POST"; body?: string },
  ): Promise<IncomingMessage> {
    publicUrl(url.href);
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const res = await open(
        url,
        { "Accept-Encoding": "identity", ...headers },
        signal,
        options,
      );
      if (
        (res.statusCode === 429 || (res.statusCode ?? 0) >= 500) &&
        attempt < 3
      ) {
        const raw = Number(res.headers["retry-after"]);
        const seconds = Number.isFinite(raw) && raw > 0 ? raw : 2 ** attempt;
        res.destroy();
        if (seconds > 30)
          throw new CloudError(
            "The service requested a longer wait. Retry this job later.",
          );
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new Error("Paused"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, seconds * 1000);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
        continue;
      }
      if (res.statusCode !== 200) {
        const status = res.statusCode;
        res.destroy();
        throw new CloudError(
          status === 401 || status === 403
            ? "Access was denied. Check this account's read permissions or reconnect."
            : status === 412
              ? "A selected file changed. Create a new selection to download its new version."
              : "The service could not return this data. Check availability and retry.",
        );
      }
      if (
        res.headers["content-encoding"] &&
        res.headers["content-encoding"] !== "identity"
      ) {
        res.destroy();
        throw new CloudError("Unexpected encoded response.");
      }
      return res;
    }
  }
  async function json(
    url: URL,
    signal: AbortSignal,
    headers?: Record<string, string>,
    options?: { method: "POST"; body?: string },
  ) {
    const res = await response(url, signal, headers, options);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of res) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024)
          throw new CloudError("The service returned too much metadata.");
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      res.destroy();
    }
  }
  return { response, json };
}
export function apiUrl(
  base: string,
  query: Record<string, string | undefined> = {},
) {
  const url = publicUrl(base);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, value);
  return url;
}
export function contentSize(res: IncomingMessage) {
  const raw = res.headers["content-length"];
  if (raw === undefined) return undefined;
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size < 0)
    throw new CloudError("The service returned an invalid size.");
  return size;
}
