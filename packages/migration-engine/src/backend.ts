import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import * as fs from "node:fs/promises";
import { createMigrationRuntime } from "./service";
import { startLocalApi } from "./http";
export { createMigrationRuntime } from "./service";
export type { MigrationStore } from "./store";

if (require.main === module) {
  const headless = process.argv[2] === "--serve";
  const profile = process.argv[headless ? 3 : 2];
  if (!profile || resolve(profile) !== profile)
    throw new Error("An absolute Migration profile is required.");
  const protocolWrite = process.stdout.write.bind(process.stdout);
  // Dependency logs must not corrupt the desktop protocol or expose credentials.
  process.stdout.write = process.stderr.write.bind(process.stderr);
  console.log = console.info = (...args: unknown[]) => console.error(...args);
  void (async () => {
    await fs.mkdir(profile, { recursive: true, mode: 0o700 });
    const lockPath = join(profile, "service.lock");
    const lock = await fs.open(lockPath, "wx", 0o600).catch(() => {
      throw new Error(
        "This profile is already owned. After a crash, verify its service.lock PID has exited before removing that lock.",
      );
    });
    await lock.writeFile(String(process.pid));
    await lock.close();
    let runtime: Awaited<ReturnType<typeof createMigrationRuntime>> | undefined;
    let api: Awaited<ReturnType<typeof startLocalApi>> | undefined;
    const descriptor = join(profile, "local-api.json");
    let ending = false;
    const close = async () => {
      if (ending) return;
      ending = true;
      await api?.close();
      await runtime?.close();
      await fs.rm(descriptor, { force: true });
      await fs.rm(lockPath, { force: true });
    };
    try {
      runtime = await createMigrationRuntime(profile);
      api = await startLocalApi(runtime);
      for (const signal of ["SIGTERM", "SIGINT"] as const)
        process.once(signal, () => {
          void close().then(() => process.exit(0));
        });
      await fs.writeFile(
        descriptor,
        JSON.stringify({
          version: 1,
          url: api.url,
          token: api.token,
          pid: process.pid,
        }),
        { mode: 0o600 },
      );
      await fs.chmod(descriptor, 0o600);
      if (headless) {
        console.error(
          "Migration service ready; connection details are in the selected profile’s local-api.json.",
        );
        return;
      }
      let queue = Promise.resolve();
      createInterface({ input: process.stdin })
        .on("line", (line) => {
          queue = queue.then(async () => {
            let id: unknown;
            try {
              if (line.length > 150_000)
                throw new Error("Request is too large.");
              const request = JSON.parse(line);
              id = request.id;
              const result = await runtime!.request(
                request.command,
                request.args,
              );
              protocolWrite(JSON.stringify({ id, result }) + "\n");
            } catch (error) {
              protocolWrite(
                JSON.stringify({
                  id,
                  error: error instanceof Error ? error.message : String(error),
                }) + "\n",
              );
            }
          });
        })
        .on("close", () => {
          void queue.then(close).then(() => process.exit(0));
        });
    } catch (error) {
      await close();
      throw error;
    }
  })().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
