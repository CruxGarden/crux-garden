import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { CloudError } from "./common";
import type { CloudAdapter } from "./common";

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}
export type TokenExchange = (
  values: Record<string, string>,
) => Promise<OAuthTokens>;

/** Shared public-client PKCE callback. Provider configuration, not renderer input,
 * chooses the endpoint, port and path. Tokens never pass through the host UI. */
export async function beginLoopbackOAuth(config: {
  label: string;
  endpoint: string;
  parameters: Record<string, string>;
  port: number;
  path: string;
  connect(
    code: string,
    verifier: string,
    redirect: string,
  ): Promise<CloudAdapter>;
  connected(adapter: CloudAdapter): void;
  failed(error: unknown): void;
}) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("hex");
  let redirect = "";
  let used = false;
  let cancelled = false;
  let timer: NodeJS.Timeout | undefined;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Connection", "close");
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Content-Security-Policy", "default-src 'none'");
    let url: URL;
    try {
      url = new URL(request.url ?? "/", redirect || "http://127.0.0.1");
    } catch {
      response.writeHead(400);
      response.end("Invalid authorization response.");
      return;
    }
    if (
      !redirect ||
      request.method !== "GET" ||
      request.headers.host !== new URL(redirect).host ||
      url.origin !== new URL(redirect).origin ||
      url.pathname !== config.path ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== state ||
      used ||
      cancelled
    ) {
      response.writeHead(400);
      response.end("Invalid authorization response.");
      return;
    }
    used = true;
    try {
      const code = url.searchParams.get("code");
      if (
        !code ||
        code.length > 8192 ||
        url.searchParams.getAll("code").length !== 1 ||
        url.searchParams.has("error")
      )
        throw new CloudError(
          `${config.label} connection was cancelled. You can try again.`,
        );
      const adapter = await config.connect(code, verifier, redirect);
      if (cancelled) {
        adapter.close?.();
        throw new CloudError("Connection cancelled.");
      }
      config.connected(adapter);
      response.end(`${config.label} connected. Return to Crux Garden Migrate.`);
    } catch (e) {
      if (!cancelled) config.failed(e);
      response.end(
        "Connection was not completed. Return to Migrate and try again.",
      );
    } finally {
      clearTimeout(timer);
      server.close();
      server.closeIdleConnections();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, "127.0.0.1", resolve);
    });
  } catch {
    server.close();
    throw new CloudError(
      `${config.label} could not open its local sign-in callback. Close another pending connection or app using port ${config.port}, then retry.`,
    );
  }
  redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}${config.path}`;
  timer = setTimeout(() => {
    cancelled = true;
    server.close();
    server.closeAllConnections();
    config.failed(
      new CloudError(
        `${config.label} connection timed out. Try connecting again.`,
      ),
    );
  }, 5 * 60_000);
  timer.unref();
  const url = new URL(config.endpoint);
  url.search = new URLSearchParams({
    ...config.parameters,
    redirect_uri: redirect,
    response_type: "code",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return {
    url: url.href,
    close() {
      cancelled = true;
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    },
  };
}
