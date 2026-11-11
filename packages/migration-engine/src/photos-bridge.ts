import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";

const MAX_FRAME = 524_288;
const MAX_RESOURCE = 64 * 1024 ** 3;
export class PhotosBridgeError extends Error {
  constructor(readonly code: string) {
    super(`Photos bridge: ${code}`);
  }
}
/** Internal process transport, deliberately not registered with HTTP or desktop commands.
 * No permissions, library calls, destinations or database work occur on construction.
 * The caller must finish the iterator before considering any received bytes complete.
 */
export class PhotosBridge {
  private child: ChildProcessWithoutNullStreams;
  private input: AsyncIterator<Buffer>;
  private buffered = Buffer.alloc(0);
  private busy = false;
  private closed = false;
  private sequence = 0;
  private readonly exited: Promise<void>;
  private readonly idleMs: number;
  private readonly deadlineMs: number;
  private readonly maxBytes: number;
  constructor(
    binary: string,
    options: { idleMs?: number; deadlineMs?: number; maxBytes?: number } = {},
  ) {
    if (!isAbsolute(binary)) throw new PhotosBridgeError("invalid_helper_path");
    this.idleMs = options.idleMs ?? 30_000;
    this.deadlineMs = options.deadlineMs ?? 7_200_000;
    this.maxBytes = options.maxBytes ?? MAX_RESOURCE;
    if (
      ![this.idleMs, this.deadlineMs, this.maxBytes].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      this.maxBytes > MAX_RESOURCE
    )
      throw new PhotosBridgeError("invalid_limits");
    this.child = spawn(binary, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8" },
    });
    // Framework diagnostics must never become application messages or protocol frames.
    this.child.stderr.resume();
    // Spawn failure can precede the first iterator read; keep that error handled.
    this.child.stdout.on("error", () => {});
    this.child.on("error", () =>
      this.child.stdout.destroy(new PhotosBridgeError("helper_unavailable")),
    );
    this.child.stdin.on("error", () => {});
    this.input = this.child.stdout[Symbol.asyncIterator]();
    this.exited = new Promise((resolve) =>
      this.child.once("close", () => {
        this.closed = true;
        resolve();
      }),
    );
  }
  async close() {
    this.closed = true;
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.child.kill("SIGTERM");
    const force = setTimeout(() => this.child.kill("SIGKILL"), 1000);
    force.unref();
    await this.exited;
    clearTimeout(force);
  }
  private async frame(): Promise<Record<string, unknown>> {
    while (true) {
      const newline = this.buffered.indexOf(10);
      if (newline >= 0) {
        if (newline > MAX_FRAME) throw new PhotosBridgeError("oversized_frame");
        const line = this.buffered.subarray(0, newline);
        this.buffered = this.buffered.subarray(newline + 1);
        let value: unknown;
        try {
          value = JSON.parse(line.toString("utf8"));
        } catch {
          throw new PhotosBridgeError("invalid_frame");
        }
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new PhotosBridgeError("invalid_frame");
        return value as Record<string, unknown>;
      }
      if (this.buffered.length > MAX_FRAME)
        throw new PhotosBridgeError("oversized_frame");
      const next = await this.input.next();
      if (next.done) throw new PhotosBridgeError("incomplete_response");
      this.buffered = Buffer.concat([this.buffered, Buffer.from(next.value)]);
    }
  }
  private async *exchange(
    command: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>> {
    if (this.closed) throw new PhotosBridgeError("session_closed");
    if (this.busy) throw new PhotosBridgeError("session_busy");
    signal?.throwIfAborted();
    const id = ++this.sequence;
    const line = Buffer.from(JSON.stringify({ ...args, id, command }) + "\n");
    if (line.length > 65_536) throw new PhotosBridgeError("oversized_request");
    this.busy = true;
    let terminal = false;
    let failure: PhotosBridgeError | undefined;
    const stop = (code: string) => {
      failure = new PhotosBridgeError(code);
      this.child.stdout.destroy(failure);
      void this.close();
    };
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    const deadline = setTimeout(
      () => stop("deadline_exceeded"),
      this.deadlineMs,
    );
    try {
      if (signal?.aborted) abort();
      await new Promise<void>((resolve, reject) =>
        this.child.stdin.write(line, (error) =>
          error
            ? reject(new PhotosBridgeError("helper_unavailable"))
            : resolve(),
        ),
      );
      while (true) {
        const idle = setTimeout(() => stop("idle_timeout"), this.idleMs);
        let frame;
        try {
          frame = await this.frame();
        } finally {
          clearTimeout(idle);
        }
        if (failure) throw failure;
        if (frame.id !== id) throw new PhotosBridgeError("unexpected_response");
        if (frame.kind === "error") {
          if (
            typeof frame.code !== "string" ||
            !/^[a-z_]{1,64}$/.test(frame.code)
          )
            throw new PhotosBridgeError("invalid_error");
          terminal = true;
          throw new PhotosBridgeError(frame.code);
        }
        if (frame.kind === "result") {
          terminal = true;
          yield frame;
          return;
        }
        if (frame.kind !== "chunk" || command !== "read")
          throw new PhotosBridgeError("unexpected_frame");
        yield frame;
      }
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      if (!terminal) await this.close();
      this.busy = false;
    }
  }
  async request(
    command: "hello" | "status" | "open" | "page",
    args: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    for await (const frame of this.exchange(command, args, signal)) {
      if (
        !frame.value ||
        typeof frame.value !== "object" ||
        Array.isArray(frame.value)
      ) {
        await this.close();
        throw new PhotosBridgeError("invalid_result");
      }
      return frame.value as Record<string, unknown>;
    }
    throw new PhotosBridgeError("incomplete_response");
  }
  async *read(
    key: string,
    networkAllowed: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<Buffer> {
    if (
      typeof key !== "string" ||
      key.length > 128 ||
      typeof networkAllowed !== "boolean"
    )
      throw new PhotosBridgeError("invalid_selection");
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const frame of this.exchange(
      "read",
      { key, networkAllowed },
      signal,
    )) {
      if (frame.kind === "chunk") {
        if (
          typeof frame.data !== "string" ||
          frame.data.length > 65_536 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            frame.data,
          )
        )
          throw new PhotosBridgeError("invalid_chunk");
        const chunk = Buffer.from(frame.data, "base64");
        if (!chunk.length || chunk.toString("base64") !== frame.data)
          throw new PhotosBridgeError("invalid_chunk");
        bytes += chunk.length;
        if (bytes > this.maxBytes)
          throw new PhotosBridgeError("resource_too_large");
        hash.update(chunk);
        yield chunk;
      } else {
        const result = frame.value as
          | { bytes?: unknown; sha256?: unknown }
          | undefined;
        if (
          !result ||
          result.bytes !== bytes ||
          result.sha256 !== hash.digest("hex")
        ) {
          await this.close();
          throw new PhotosBridgeError("stream_integrity_failed");
        }
      }
    }
  }
}
