import {
  beginLoopbackOAuth,
  type OAuthTokens,
  type TokenExchange,
} from "./oauth";
import { CloudError, network, textField, type CloudAdapter } from "./common";
import type { DownloadOpen } from "../network";
export function googleTokenExchange(open?: DownloadOpen): TokenExchange {
  return async (values) =>
    network(open).json(
      new URL("https://oauth2.googleapis.com/token"),
      AbortSignal.timeout(30000),
      { "Content-Type": "application/x-www-form-urlencoded" },
      { method: "POST", body: new URLSearchParams(values).toString() },
    );
}
function validate(tokens: OAuthTokens, scope: string) {
  if (
    !tokens ||
    typeof tokens.access_token !== "string" ||
    !/^[\x21-\x7e]{1,16384}$/.test(tokens.access_token) ||
    (tokens.refresh_token !== undefined &&
      (typeof tokens.refresh_token !== "string" ||
        !/^[\x21-\x7e]{1,16384}$/.test(tokens.refresh_token))) ||
    (tokens.expires_in !== undefined &&
      (!Number.isFinite(tokens.expires_in) || tokens.expires_in < 0))
  )
    throw new CloudError("Google returned an invalid authorization response.");
  if (
    tokens.scope !== undefined &&
    (typeof tokens.scope !== "string" ||
      !tokens.scope.split(" ").includes(scope))
  )
    throw new CloudError("Google did not grant the requested read access.");
}
export async function beginGoogleAccount(
  input: Record<string, unknown>,
  provider: string,
  scope: string,
  adapter: (
    tokens: OAuthTokens,
    clientId: string,
    secret: string,
    exchange: TokenExchange,
  ) => Promise<CloudAdapter>,
  connected: (a: CloudAdapter) => void,
  failed: (e: unknown) => void,
  open?: DownloadOpen,
  exchange: TokenExchange = googleTokenExchange(open),
) {
  const clientId = textField(
    input.clientId,
    "your Google desktop client ID",
    512,
  );
  const secret = input.clientSecret
    ? textField(input.clientSecret, "your desktop client secret", 512)
    : "";
  if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))
    throw new CloudError("Enter a Google Desktop app client ID.");
  return beginLoopbackOAuth({
    label: provider,
    endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    port: 0,
    path: "/callback",
    parameters: {
      client_id: clientId,
      scope,
      access_type: "offline",
      prompt: "consent",
    },
    async connect(code, verifier, redirect) {
      const tokens = await exchange({
        client_id: clientId,
        client_secret: secret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      });
      validate(tokens, scope);
      return adapter(tokens, clientId, secret, exchange);
    },
    connected,
    failed,
  });
}
export function googleSession(
  initial: OAuthTokens,
  clientId: string,
  secret: string,
  scope: string,
  exchange: TokenExchange,
) {
  validate(initial, scope);
  let tokens = { ...initial },
    expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  let refreshing: Promise<void> | undefined,
    closed = false;
  return {
    async headers() {
      if (closed) throw new CloudError("Connect Google again.");
      if (Date.now() > expires - 60_000) {
        if (!tokens.refresh_token)
          throw new CloudError("Google authorization expired. Connect again.");
        refreshing ??= exchange({
          client_id: clientId,
          client_secret: secret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        })
          .then((next) => {
            if (closed) throw new CloudError("Connect Google again.");
            validate(next, scope);
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
      if (closed) throw new CloudError("Connect Google again.");
      return { Authorization: `Bearer ${tokens.access_token}` };
    },
    close() {
      closed = true;
      tokens = { access_token: "" };
      secret = "";
    },
  };
}
