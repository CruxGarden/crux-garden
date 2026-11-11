import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { CloudEntry, CloudItem } from "@cruxgarden/migration-contracts";
import { apiUrl, CloudError, network, type CloudAdapter } from "./common";
import {
  beginGoogleAccount,
  googleSession,
  googleTokenExchange,
} from "./google-auth";
import type { OAuthTokens, TokenExchange } from "./oauth";
import type { DownloadOpen } from "../network";
const scope = "https://www.googleapis.com/auth/gmail.readonly";
const base = "https://gmail.googleapis.com/gmail/v1/users/me";
const idPattern = /^[A-Za-z0-9_-]{1,256}$/;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = () => {
  throw new CloudError(
    "Gmail returned unsupported or incomplete message metadata. Use Takeout or choose another selection.",
  );
};
function id(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) return fail();
  return value;
}
export async function beginGmail(
  input: Record<string, unknown>,
  connected: (adapter: CloudAdapter) => void,
  failed: (e: unknown) => void,
  open?: DownloadOpen,
  exchange: TokenExchange = googleTokenExchange(open),
) {
  return beginGoogleAccount(
    input,
    "Gmail",
    scope,
    (tokens, clientId, secret, exchange) =>
      gmail(tokens, clientId, secret, open, exchange),
    connected,
    failed,
    open,
    exchange,
  );
}
export async function gmail(
  initial: OAuthTokens,
  clientId: string,
  secret: string,
  open?: DownloadOpen,
  exchange: TokenExchange = googleTokenExchange(open),
): Promise<CloudAdapter> {
  const session = googleSession(initial, clientId, secret, scope, exchange);
  const net = network(open);
  const json = async (
    path: string,
    query: Record<string, string | undefined>,
    signal: AbortSignal,
    raw = false,
  ) =>
    net.json(
      apiUrl(base + path, query),
      signal,
      await session.headers(),
      undefined,
      raw ? 96 * 1024 ** 2 : 8 * 1024 ** 2,
    );
  const profile = await json("/profile", {}, AbortSignal.timeout(30000));
  if (
    typeof profile.emailAddress !== "string" ||
    profile.emailAddress.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(profile.emailAddress)
  )
    throw new CloudError("Gmail did not provide a supported source address.");
  const account = profile.emailAddress.toLowerCase();
  const labelResult = await json("/labels", {}, AbortSignal.timeout(30000));
  if (!Array.isArray(labelResult.labels) || labelResult.labels.length > 10000)
    throw new CloudError(
      "Gmail label list is missing or exceeds this preview's limit.",
    );
  const labels = new Map<string, { id: string; name: string; type: string }>();
  for (const v of labelResult.labels) {
    const key = id(v.id);
    if (
      labels.has(key) ||
      typeof v.name !== "string" ||
      !v.name ||
      v.name.length > 512 ||
      !["system", "user"].includes(v.type)
    )
      return fail();
    labels.set(key, { id: key, name: v.name, type: v.type });
  }
  function snapshot(v: any, expected: string) {
    if (
      !v ||
      v.id !== expected ||
      typeof v.historyId !== "string" ||
      !/^\d{1,30}$/.test(v.historyId) ||
      typeof v.internalDate !== "string" ||
      !/^\d{1,20}$/.test(v.internalDate) ||
      !Array.isArray(v.labelIds) ||
      v.labelIds.length > 200 ||
      new Set(v.labelIds).size !== v.labelIds.length
    )
      return fail();
    const selectedLabels = (v.labelIds as unknown[])
      .map((key) => {
        const label = labels.get(id(key));
        if (!label)
          throw new CloudError(
            "Gmail labels changed since connection. Reconnect and create a new selection.",
          );
        return { ...label };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      messageId: id(v.id),
      threadId: id(v.threadId),
      historyId: v.historyId as string,
      internalDate: v.internalDate as string,
      labels: selectedLabels,
      sourceAddress: account,
    };
  }
  const metadata = (key: string, signal: AbortSignal) =>
    json(
      `/messages/${encodeURIComponent(id(key))}`,
      {
        format: "metadata",
        metadataHeaders: "Subject",
        fields: "id,threadId,labelIds,historyId,internalDate,payload(headers)",
      },
      signal,
    );
  async function page(
    parent: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ) {
    if (
      parent !== "all" &&
      !(parent.startsWith("label:") && labels.has(parent.slice(6)))
    )
      throw new CloudError("Choose a listed Gmail group.");
    const value = await json(
      "/messages",
      {
        maxResults: "25",
        labelIds: parent === "all" ? undefined : parent.slice(6),
        includeSpamTrash: "true",
        pageToken: cursor,
        fields: "messages(id,threadId),nextPageToken",
      },
      signal,
    );
    if (
      (value.messages !== undefined &&
        (!Array.isArray(value.messages) || value.messages.length > 25)) ||
      (value.nextPageToken !== undefined &&
        (typeof value.nextPageToken !== "string" ||
          !value.nextPageToken ||
          value.nextPageToken.length > 8192))
    )
      return fail();
    const messages = value.messages || [];
    const seen = new Set();
    for (const message of messages) {
      const key = id(message.id);
      if (seen.has(key)) return fail();
      seen.add(key);
    }
    return { messages, cursor: value.nextPageToken as string | undefined };
  }
  function checked(v: any, item: CloudItem) {
    if (digest(snapshot(v, item.id)) !== item.revision)
      throw new CloudError(
        "A selected Gmail message or its labels changed. Create a new selection; completed files remain intact.",
      );
  }
  return {
    provider: "Gmail",
    identity: `gmail:${digest(account)}`,
    label: account,
    notes: [
      "Choose individual messages, whole labels, or All messages including Spam and Trash. Selected labels form a union; overlapping messages are downloaded once by Gmail ID. Nothing is selected automatically.",
      "Raw EML files retain message and attachment bytes. Gmail IDs, internal date, history revision and label names from this connection's snapshot are saved separately in the collection manifest. Settings, filters, label colors and classification labels are not exported; full Takeout remains the broader preservation option.",
      "This preview allows 5,000 messages and 16 MiB of provider metadata per job, 64 MiB decoded content per message and 96 MiB RAW JSON responses. Oversized data stops the job; use Takeout as an alternative. Sizes are unknown until downloaded.",
      "Label membership is resolved during discovery, not an atomic mailbox snapshot. Reconnect after quitting; changed source addresses cannot resume an existing job. Metadata-only local reuse is disabled because Gmail supplies no content checksum.",
    ],
    async browse(parent, cursor, signal) {
      if (!parent) {
        const index = cursor === undefined ? 0 : Number(cursor);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index % 100 !== 0 ||
          index > labels.size
        )
          throw new CloudError("Invalid Gmail label cursor.");
        const groups: CloudEntry[] = [
          {
            id: "all",
            name: "All messages, including Spam and Trash",
            kind: "folder",
          },
          ...[...labels.values()].map((v) => ({
            id: `label:${v.id}`,
            name: v.name,
            kind: "folder" as const,
          })),
        ];
        return {
          entries: groups.slice(index, index + 100),
          cursor: index + 100 < groups.length ? String(index + 100) : undefined,
        };
      }
      const result = await page(parent, cursor, signal);
      const entries: CloudEntry[] = [];
      for (const v of result.messages) {
        const key = id(v.id),
          details = await metadata(key, signal);
        snapshot(details, key);
        const subject = details.payload?.headers?.find(
          (h: any) =>
            typeof h.name === "string" && h.name.toLowerCase() === "subject",
        )?.value;
        entries.push({
          id: `message:${key}`,
          name: `${typeof subject === "string" ? subject.slice(0, 160) : "Message"} [${key}]`,
          kind: "file",
        });
      }
      return { entries, cursor: result.cursor };
    },
    async *discover(selection, signal) {
      const seen = new Set<string>();
      let metadataBytes = 0;
      async function item(key: string): Promise<CloudItem | undefined> {
        if (seen.has(key)) return;
        if (seen.size >= 5000)
          throw new CloudError(
            "Select at most 5,000 Gmail messages per job, or use Takeout.",
          );
        seen.add(key);
        const value = snapshot(await metadata(key, signal), key);
        metadataBytes += Buffer.byteLength(JSON.stringify(value));
        if (metadataBytes > 16 * 1024 ** 2)
          throw new CloudError(
            "Selected Gmail metadata exceeds 16 MiB. Choose fewer labels/messages.",
          );
        return {
          id: key,
          path: `messages/${key}.eml`,
          revision: digest(value),
          reusePolicy: "checksum-only",
          metadata: value,
        };
      }
      for (const selected of selection) {
        if (selected.id.startsWith("message:") && selected.kind === "file") {
          const value = await item(id(selected.id.slice(8)));
          if (value) yield value;
        } else {
          let cursor: string | undefined;
          const cursors = new Set<string>();
          let pages = 0;
          do {
            if (++pages > 1000)
              throw new CloudError(
                "Gmail listing exceeds the page limit. Choose a narrower selection.",
              );
            const result = await page(selected.id, cursor, signal);
            for (const v of result.messages) {
              const value = await item(id(v.id));
              if (value) yield value;
            }
            cursor = result.cursor;
            if (cursor && cursors.has(cursor))
              throw new CloudError("Gmail repeated its listing cursor.");
            if (cursor) cursors.add(cursor);
          } while (cursor);
        }
      }
    },
    async read(item, signal) {
      checked(await metadata(item.id, signal), item);
      const value = await json(
        `/messages/${encodeURIComponent(id(item.id))}`,
        {
          format: "raw",
          fields: "id,threadId,labelIds,historyId,internalDate,raw",
        },
        signal,
        true,
      );
      checked(value, item);
      if (
        typeof value.raw !== "string" ||
        !value.raw ||
        (value.raw.includes("=") && value.raw.length % 4 !== 0) ||
        value.raw.length > Math.ceil((64 * 1024 ** 2) / 3) * 4 ||
        !/^[A-Za-z0-9_-]+={0,2}$/.test(value.raw)
      )
        throw new CloudError(
          "Gmail returned invalid or oversized raw mail. Use Takeout for this message.",
        );
      const bytes = Buffer.from(value.raw, "base64url");
      if (
        bytes.length > 64 * 1024 ** 2 ||
        bytes.toString("base64url") !== value.raw.replace(/=+$/, "")
      )
        throw new CloudError(
          "Gmail returned noncanonical or oversized raw mail.",
        );
      return { body: Readable.from([bytes]), size: bytes.length };
    },
    async afterRead(item, signal) {
      checked(await metadata(item.id, signal), item);
    },
    close() {
      session.close();
    },
  };
}
