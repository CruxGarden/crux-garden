import { openHttps, type DownloadOpen } from "../network";
export type { DownloadOpen } from "../network";
import { createHash } from "node:crypto";
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
