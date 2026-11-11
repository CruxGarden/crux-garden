import type { CloudAdapter } from "./common";
import type { CloudItem } from "@cruxgarden/migration-contracts";
import type { DownloadOpen } from "../network";
import { CloudError, contentSize, network, textField } from "./common";
import { beginLoopbackOAuth } from "./oauth";
import type { OAuthTokens as Tokens, TokenExchange } from "./oauth";

const scopes = [
  "files.metadata.read",
  "files.content.read",
  "account_info.read",
];
export const DROPBOX_CALLBACK = "http://127.0.0.1:53683/callback/dropbox";
// Dropbox's header JSON must escape every non-ASCII UTF-16 code unit, including DEL.
export const headerJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
function tokenRequest(open?: DownloadOpen): TokenExchange {
  return async (values) => {
    const result = await network(open).json(
      new URL("https://api.dropboxapi.com/oauth2/token"),
      AbortSignal.timeout(30000),
      { "Content-Type": "application/x-www-form-urlencoded" },
      { method: "POST", body: new URLSearchParams(values).toString() },
    );
    validateTokens(result);
    return result;
  };
}
function validateTokens(value: Tokens) {
  if (
    !value ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    value.access_token.length > 16384 ||
    /[\r\n]/.test(value.access_token) ||
    (value.refresh_token !== undefined &&
      (typeof value.refresh_token !== "string" ||
        !value.refresh_token ||
        value.refresh_token.length > 16384)) ||
    (value.expires_in !== undefined &&
      (!Number.isFinite(value.expires_in) || value.expires_in < 0))
  )
    throw new CloudError("Dropbox returned an invalid authorization response.");
  if (
    value.scope !== undefined &&
    (typeof value.scope !== "string" ||
      scopes.some((scope) => !value.scope!.split(" ").includes(scope)))
  )
    throw new CloudError("Dropbox did not grant the requested read access.");
}
export async function beginDropbox(
  input: Record<string, unknown>,
  connected: (adapter: CloudAdapter) => void,
  failed: (error: unknown) => void,
  open?: DownloadOpen,
  exchange: TokenExchange = tokenRequest(open),
) {
  const clientId = textField(input.clientId, "your Dropbox app key", 256);
  if (!/^[a-zA-Z0-9_-]+$/.test(clientId))
    throw new CloudError("Enter a Dropbox app key.");
  return beginLoopbackOAuth({
    label: "Dropbox",
    endpoint: "https://www.dropbox.com/oauth2/authorize",
    port: 53683,
    path: "/callback/dropbox",
    parameters: {
      client_id: clientId,
      scope: scopes.join(" "),
      token_access_type: "offline",
    },
    async connect(code, verifier, redirect) {
      const tokens = await exchange({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      });
      validateTokens(tokens);
      return dropbox(tokens, clientId, open, exchange);
    },
    connected,
    failed,
  });
}
interface Metadata {
  ".tag": "file" | "folder";
  id: string;
  name: string;
  path_lower: string;
  path_display?: string;
  rev?: string;
  size?: number;
  content_hash?: string;
  is_downloadable?: boolean;
  client_modified?: string;
  server_modified?: string;
}
function metadata(value: any): Metadata {
  if (
    !value ||
    !["file", "folder"].includes(value[".tag"]) ||
    typeof value.id !== "string" ||
    !/^id:[a-zA-Z0-9_-]+$/.test(value.id) ||
    value.id.length > 512 ||
    typeof value.name !== "string" ||
    !value.name ||
    value.name.length > 255 ||
    /[/\\\x00-\x1f]/.test(value.name) ||
    [".", ".."].includes(value.name) ||
    typeof value.path_lower !== "string" ||
    !value.path_lower.startsWith("/") ||
    value.path_lower.length > 2048
  )
    throw new CloudError(
      "Dropbox returned unsupported file metadata. Choose a smaller selection or use a local export.",
    );
  if (
    value[".tag"] === "file" &&
    (!Number.isSafeInteger(value.size) ||
      value.size < 0 ||
      typeof value.rev !== "string" ||
      !/^[a-fA-F0-9]{9,64}$/.test(value.rev) ||
      (value.content_hash !== undefined &&
        !/^[a-fA-F0-9]{64}$/.test(value.content_hash)))
  )
    throw new CloudError(
      "Dropbox returned invalid size, revision or checksum metadata.",
    );
  for (const [key, limit] of [
    ["path_display", 2048],
    ["client_modified", 64],
    ["server_modified", 64],
  ] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].length > limit)
    )
      throw new CloudError("Dropbox returned unsupported file metadata.");
  }
  if (
    value.is_downloadable !== undefined &&
    typeof value.is_downloadable !== "boolean"
  )
    throw new CloudError("Dropbox returned invalid download availability.");
  // Keep only migration metadata; unrelated account/sharing information is not copied.
  return {
    ".tag": value[".tag"],
    id: value.id,
    name: value.name,
    path_lower: value.path_lower,
    path_display:
      typeof value.path_display === "string" ? value.path_display : undefined,
    rev: value.rev,
    size: value.size,
    content_hash: value.content_hash?.toLowerCase(),
    is_downloadable: value.is_downloadable,
    client_modified: value.client_modified,
    server_modified: value.server_modified,
  };
}
export async function dropbox(
  initial: Tokens,
  clientId: string,
  open?: DownloadOpen,
  exchange: TokenExchange = tokenRequest(open),
): Promise<CloudAdapter> {
  const net = network(open);
  let tokens = initial,
    expires = Date.now() + (initial.expires_in ?? 14400) * 1000;
  let closed = false;
  let refreshing: Promise<void> | undefined;
  async function headers() {
    if (closed) throw new CloudError("Dropbox disconnected. Connect again.");
    if (Date.now() > expires - 60000) {
      if (!tokens.refresh_token)
        throw new CloudError("Dropbox authorization expired. Connect again.");
      refreshing ??= exchange({
        client_id: clientId,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      })
        .then((next) => {
          validateTokens(next);
          if (closed) throw new CloudError("Dropbox disconnected.");
          tokens = {
            ...next,
            refresh_token: next.refresh_token ?? tokens.refresh_token,
          };
          expires = Date.now() + (next.expires_in ?? 14400) * 1000;
        })
        .finally(() => {
          refreshing = undefined;
        });
      await refreshing;
    }
    return {
      Authorization: `Bearer ${tokens.access_token}`,
      "Dropbox-API-Path-Root": '{".tag":"home"}',
    };
  }
  async function rpc(route: string, args: unknown, signal: AbortSignal) {
    return net.json(
      new URL("https://api.dropboxapi.com/2/" + route),
      signal,
      { ...(await headers()), "Content-Type": "application/json" },
      { method: "POST", body: JSON.stringify(args) },
    );
  }
  const account = await rpc(
    "users/get_current_account",
    null,
    AbortSignal.timeout(30000),
  );
  if (
    typeof account.account_id !== "string" ||
    !/^dbid:[A-Za-z0-9_-]+$/.test(account.account_id) ||
    typeof account.root_info?.home_namespace_id !== "string" ||
    !/^\d+$/.test(account.root_info.home_namespace_id)
  )
    throw new CloudError(
      "Dropbox did not provide a stable personal-folder identity.",
    );
  const root = {
    ".tag": "folder" as const,
    id: "",
    name: "Dropbox home",
    path_lower: "",
  };
  const get = async (id: string, signal: AbortSignal) =>
    id
      ? metadata(
          await rpc(
            "files/get_metadata",
            { path: id, include_deleted: false },
            signal,
          ),
        )
      : root;
  const cursors = new Map<string, string>();
  async function listing(
    parent: string,
    cursor: string | undefined,
    sig: AbortSignal,
  ) {
    if (cursor && cursors.get(cursor) !== parent)
      throw new CloudError("Choose the next page from this folder.");
    const page = await rpc(
      cursor ? "files/list_folder/continue" : "files/list_folder",
      cursor
        ? { cursor }
        : {
            path: parent,
            recursive: false,
            include_deleted: false,
            limit: 500,
          },
      sig,
    );
    if (
      !Array.isArray(page.entries) ||
      page.entries.length > 2000 ||
      typeof page.has_more !== "boolean" ||
      typeof page.cursor !== "string" ||
      !page.cursor ||
      page.cursor.length > 8192
    )
      throw new CloudError("Dropbox returned an incomplete folder listing.");
    const entries = page.entries.map(metadata);
    if (page.has_more) {
      if (cursors.size >= 20000)
        throw new CloudError("Browse a smaller Dropbox selection.");
      cursors.set(page.cursor, parent);
    }
    return {
      entries,
      cursor: page.has_more ? (page.cursor as string) : undefined,
    };
  }
  async function unchanged(item: CloudItem, sig: AbortSignal) {
    const v = await get(item.id, sig);
    if (
      v[".tag"] !== "file" ||
      v.id !== item.id ||
      v.rev !== item.revision ||
      v.size !== item.size ||
      (item.checksum && v.content_hash !== item.checksum.hex) ||
      v.is_downloadable === false
    )
      throw new CloudError(
        "A selected Dropbox file changed or is unavailable. Create a new selection.",
      );
  }
  return {
    provider: "Dropbox",
    identity: `dropbox:${account.account_id}:home:${account.root_info.home_namespace_id}`,
    label: "Dropbox home",
    notes: [
      "Selected current files in your Dropbox home namespace, including mounted folders. Team-space roots, history, permissions, comments and unmounted shares are not exported.",
      "Files use revision-bound downloads and Dropbox content-hash checks when supplied. Unsupported cloud documents stop the job; export them separately with Dropbox's own tools.",
      "Recovery is per file: interrupted files restart; completed files are checked and retained. Credentials stay in memory; reconnect after Quit. This is not a whole-account snapshot.",
    ],
    async browse(parent, cursor, sig) {
      const page = await listing(parent, cursor, sig);
      return {
        entries: page.entries.map((v: Metadata) => ({
          id: v.id,
          name: v.name,
          kind: v[".tag"],
          size: v.size,
        })),
        cursor: page.cursor,
      };
    },
    async *discover(selection, sig) {
      const visited = new Set<string>();
      async function* walk(
        id: string,
        parent: string,
        depth: number,
        expectedPath?: string,
      ): AsyncGenerator<CloudItem> {
        if (depth > 64 || visited.size >= 20000)
          throw new CloudError(
            "This Dropbox selection exceeds the folder or file limit.",
          );
        if (visited.has(id)) return;
        visited.add(id);
        const v = await get(id, sig);
        if (expectedPath !== undefined && v.path_lower !== expectedPath)
          throw new CloudError(
            "A Dropbox item moved during discovery. Create a new selection.",
          );
        if (v.id !== id)
          throw new CloudError("Dropbox returned a different selected item.");
        const path = parent + v.name;
        if (v[".tag"] === "folder") {
          let cursor: string | undefined;
          const seen = new Set<string>();
          do {
            const page = await listing(id, cursor, sig);
            for (const child of page.entries as Metadata[]) {
              if (
                child.path_lower.slice(0, child.path_lower.lastIndexOf("/")) !==
                v.path_lower
              )
                throw new CloudError(
                  "Dropbox returned an item outside the selected folder.",
                );
              yield* walk(child.id, path + "/", depth + 1, child.path_lower);
            }
            cursor = page.cursor;
            if (cursor && seen.has(cursor))
              throw new CloudError("Dropbox repeated its listing cursor.");
            if (cursor) seen.add(cursor);
          } while (cursor);
        } else {
          if (v.is_downloadable === false)
            throw new CloudError(
              "This selection includes a Dropbox cloud document that needs a separate export. Choose other files or use Dropbox's export tools.",
            );
          yield {
            id: v.id,
            path,
            revision: v.rev,
            size: v.size,
            checksum: v.content_hash
              ? { algorithm: "dropbox", hex: v.content_hash }
              : undefined,
            metadata: { ...v },
          };
        }
      }
      for (const entry of selection) yield* walk(entry.id, "", 0);
    },
    checksum: unchanged,
    async read(item, sig) {
      const res = await net.response(
        new URL("https://content.dropboxapi.com/2/files/download"),
        sig,
        {
          ...(await headers()),
          "Dropbox-API-Arg": headerJson({ path: item.id, rev: item.revision }),
        },
        { method: "POST" },
      );
      try {
        const raw = res.headers["dropbox-api-result"];
        if (typeof raw !== "string" || raw.length > 16384)
          throw new Error("Missing response metadata");
        // Content download result is FileMetadata without a union tag.
        const v = metadata({ ...JSON.parse(raw), ".tag": "file" });
        if (
          v.id !== item.id ||
          v.rev !== item.revision ||
          v.size !== item.size ||
          (item.checksum && v.content_hash !== item.checksum.hex) ||
          (contentSize(res) !== undefined && contentSize(res) !== item.size)
        )
          throw new Error("Wrong version");
        return { body: res, size: v.size };
      } catch {
        res.destroy();
        throw new CloudError(
          "Dropbox download identity, revision or size did not match the selection.",
        );
      }
    },
    afterRead: unchanged,
    close() {
      closed = true;
      tokens = { access_token: "" };
      cursors.clear();
    },
  };
}
