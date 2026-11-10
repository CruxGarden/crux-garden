import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { MIGRATION_GUIDES } from "@cruxgarden/migration-providers";
export interface MigrationService {
  request(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json")
    throw new Error("Expected application/json.");
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    request.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > 150_000) {
        exceeded = true;
        chunks.length = 0;
        reject(new Error("Request is too large."));
      } else chunks.push(chunk);
    });
    request.once("end", () => {
      if (!exceeded) resolve(Buffer.concat(chunks));
    });
    request.once("error", reject);
  });
  const value = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value;
}
/** Local integrations receive one per-run token; the renderer never receives it. */
export async function startLocalApi(service: MigrationService) {
  const token = randomBytes(32).toString("hex");
  let host = "";
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, value: unknown) => {
      response.writeHead(status);
      response.end(JSON.stringify(value));
    };
    const auth = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from("Bearer " + token);
    if (
      request.headers.host !== host ||
      request.headers.origin ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      request.resume();
      reply(403, { error: "Local API access denied." });
      return;
    }
    try {
      const url = new URL(request.url ?? "/", "http://" + host);
      let result: unknown;
      if (request.method === "GET" && url.pathname === "/v1/info")
        result = await service.request("info");
      else if (request.method === "GET" && url.pathname === "/v1/providers")
        result = MIGRATION_GUIDES;
      else if (request.method === "GET" && url.pathname === "/v1/jobs")
        result = await service.request("list");
      else if (request.method === "POST" && url.pathname === "/v1/jobs")
        result = await service.request("create", await body(request));
      else {
        const match =
          /^\/v1\/jobs\/([a-zA-Z0-9-]+)\/(source|destination|inspect|start|pause|checklist)$/.exec(
            url.pathname,
          );
        if (request.method !== "POST" || !match) {
          request.resume();
          reply(404, { error: "Unknown endpoint." });
          return;
        }
        const args = await body(request);
        result = await service.request(match[2]!, { ...args, id: match[1] });
      }
      reply(200, { result });
    } catch (error) {
      request.resume();
      reply(400, {
        error: error instanceof Error ? error.message : "Request failed.",
      });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 40;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  host = "127.0.0.1:" + (server.address() as AddressInfo).port;
  return {
    url: "http://" + host,
    token,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}
