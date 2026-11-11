import { createHash } from "node:crypto";
import {
  beginLoopbackOAuth,
  type OAuthTokens,
  type TokenExchange,
} from "./oauth";
import type { CloudAdapter } from "./common";
import type { CloudItem } from "@cruxgarden/migration-contracts";
import { apiUrl, CloudError, contentSize, network, textField } from "./common";
import type { DownloadOpen } from "../network";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const fields =
  "id,name,mimeType,size,md5Checksum,version,modifiedTime,parents,capabilities(canDownload)";
const exports: Record<string, { mime: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: ".pptx",
  },
  "application/vnd.google-apps.drawing": {
    mime: "image/svg+xml",
    extension: ".svg",
  },
};
const folderType = "application/vnd.google-apps.folder";
function segment(name: string, id: string) {
  const title =
    name
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/^\.+|[. ]+$/g, "")
      .slice(0, 80) || "file";
  return `${title} [${createHash("sha256").update(id).digest("hex").slice(0, 12)}]`;
}
export const tokenExchange: TokenExchange = async (values) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
  if (!response.ok)
    throw new CloudError(
      "Google authorization expired or was rejected. Connect again.",
    );
  const value = (await response.json()) as OAuthTokens;
  if (
    typeof value.access_token !== "string" ||
    value.access_token.length > 8192
  )
    throw new CloudError("Google returned an invalid authorization response.");
  return value;
};
/** Only the host opens this constructed Google URL. Callback and tokens stay in the engine. */
export async function beginGoogle(
  input: Record<string, unknown>,
  onConnected: (adapter: CloudAdapter) => void,
  onFailed: (error: unknown) => void,
  open?: DownloadOpen,
  exchange: TokenExchange = tokenExchange,
) {
  const clientId = textField(
    input.clientId,
    "your Google desktop client ID",
    512,
  );
  const clientSecret = input.clientSecret
    ? textField(input.clientSecret, "your desktop client secret", 512)
    : "";
  if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))
    throw new CloudError("Enter a Google Desktop app client ID.");
  return beginLoopbackOAuth({
    label: "Google Drive",
    endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    port: 0,
    path: "/callback",
    parameters: {
      client_id: clientId,
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
    },
    async connect(code, verifier, redirect) {
      const tokens = await exchange({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      });
      if (tokens.scope && !tokens.scope.split(" ").includes(SCOPE))
        throw new CloudError("Google did not grant read access to Drive.");
      return googleDrive(tokens, clientId, clientSecret, open, exchange);
    },
    connected: onConnected,
    failed: onFailed,
  });
}

export async function googleDrive(
  initial: OAuthTokens,
  clientId: string,
  clientSecret: string,
  open?: DownloadOpen,
  exchange: TokenExchange = tokenExchange,
): Promise<CloudAdapter> {
  const net = network(open);
  let tokens = initial;
  let expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  let refreshing: Promise<void> | undefined;
  async function headers() {
    if (Date.now() > expires - 60_000) {
      if (!tokens.refresh_token)
        throw new CloudError("Google authorization expired. Connect again.");
      refreshing ??= exchange({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      })
        .then((next) => {
          tokens = {
            ...next,
            refresh_token: next.refresh_token ?? tokens.refresh_token,
          };
          expires = Date.now() + (next.expires_in ?? 3600) * 1000;
        })
        .finally(() => {
          refreshing = undefined;
        });
      await refreshing;
    }
    return { Authorization: `Bearer ${tokens.access_token}` };
  }
  const base = "https://www.googleapis.com/drive/v3";
  const json = async (
    path: string,
    query: Record<string, string | undefined>,
    sig: AbortSignal,
  ) => net.json(apiUrl(base + path, query), sig, await headers());
  const about = await json(
    "/about",
    { fields: "user(displayName,permissionId)" },
    AbortSignal.timeout(30000),
  );
  if (!about.user?.permissionId)
    throw new CloudError("Google did not provide a stable account identity.");
  const metadata = (id: string, sig: AbortSignal) =>
    json(
      `/files/${encodeURIComponent(id)}`,
      { fields, supportsAllDrives: "true" },
      sig,
    );
  async function listing(
    parent: string,
    cursor: string | undefined,
    sig: AbortSignal,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(parent))
      throw new CloudError("Choose a Drive folder.");
    const page = await json(
      "/files",
      {
        q: `'${parent}' in parents and trashed = false`,
        pageSize: "500",
        pageToken: cursor,
        fields: `nextPageToken,incompleteSearch,files(${fields})`,
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      },
      sig,
    );
    if (page.incompleteSearch || !Array.isArray(page.files))
      throw new CloudError(
        "Google could not provide a complete folder listing. Select a narrower folder.",
      );
    return page;
  }
  return {
    provider: "Google Drive",
    identity: `drive:${about.user.permissionId}`,
    label: about.user.displayName || "Google Drive",
    notes: [
      "Selected files/folders reachable from My Drive. Current content and basic file metadata only; permissions, comments and version history are not exported.",
      "Google Docs, Sheets, Slides and Drawings export as DOCX, XLSX, PPTX and SVG. Unsupported Google types, shortcuts, restricted files and oversized exports stop the job rather than being silently omitted.",
      "Local names include stable ID suffixes to preserve duplicate Drive names. Original names/parents are recorded in the manifest. Account access is held in memory; reconnect after quitting.",
    ],
    async browse(parent, cursor, sig) {
      const page = await listing(parent || "root", cursor, sig);
      return {
        entries: page.files.map((v: any) => ({
          id: v.id,
          name: v.name,
          kind: v.mimeType === folderType ? "folder" : "file",
          size: v.size === undefined ? undefined : Number(v.size),
        })),
        cursor: page.nextPageToken,
      };
    },
    async *discover(selection, sig) {
      const visited = new Set<string>();
      async function* walk(
        id: string,
        parent: string,
        depth: number,
      ): AsyncGenerator<CloudItem> {
        if (depth > 64 || visited.size >= 20000)
          throw new CloudError(
            "This selection exceeds the folder or file limit.",
          );
        if (visited.has(id)) return;
        visited.add(id);
        const v = await metadata(id, sig);
        const path = parent + segment(v.name, id);
        if (v.mimeType === folderType) {
          let cursor: string | undefined;
          const seen = new Set<string>();
          do {
            const page = await listing(id, cursor, sig);
            for (const child of page.files)
              yield* walk(child.id, path + "/", depth + 1);
            cursor = page.nextPageToken;
            if (cursor && seen.has(cursor))
              throw new CloudError("Google repeated its listing cursor.");
            if (cursor) seen.add(cursor);
          } while (cursor);
        } else {
          const format = exports[v.mimeType];
          if (
            v.capabilities?.canDownload === false ||
            (String(v.mimeType).startsWith("application/vnd.google-apps.") &&
              !format)
          )
            throw new CloudError(
              "The selection includes an unsupported or restricted Google file. Choose other files or use Google Takeout for that content.",
            );
          if (!v.version)
            throw new CloudError("Google did not return a file version.");
          yield {
            id,
            path: path + (format?.extension ?? ""),
            revision: v.version,
            size: v.size === undefined ? undefined : Number(v.size),
            checksum: v.md5Checksum
              ? { algorithm: "md5", hex: v.md5Checksum }
              : undefined,
            metadata: { ...v, exportMimeType: format?.mime },
          };
        }
      }
      for (const v of selection) yield* walk(v.id, "", 0);
    },
    async read(item, sig) {
      const v = await metadata(item.id, sig);
      if (v.version !== item.revision)
        throw new CloudError(
          "A selected Drive file changed. Create a new selection.",
        );
      const mime = item.metadata?.exportMimeType as string | undefined;
      const res = await net.response(
        apiUrl(
          `${base}/files/${encodeURIComponent(item.id)}${mime ? "/export" : ""}`,
          mime
            ? { mimeType: mime }
            : { alt: "media", supportsAllDrives: "true" },
        ),
        sig,
        await headers(),
      );
      return { body: res, size: contentSize(res) };
    },
    async afterRead(item, sig) {
      if ((await metadata(item.id, sig)).version !== item.revision)
        throw new CloudError(
          "A Drive file changed during download. Create a new selection.",
        );
    },
    close() {
      tokens = { access_token: "" };
    },
  };
}
