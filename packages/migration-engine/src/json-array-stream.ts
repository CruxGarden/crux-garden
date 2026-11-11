// Bounded framing only. JSON.parse validates each complete entry; this never
// interprets JavaScript. Callbacks are provisional until finish AND file hash pass.
export function jsonArrayStream(
  prefix: string | null,
  entry: (value: unknown, index: number) => void,
  maxEntries = 100000,
) {
  const buffer = Buffer.alloc(1024 * 1024);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let state: "prefix" | "first" | "next" | "item" | "between" | "tail" | "end" =
    "prefix";
  let head = "",
    used = 0,
    count = 0,
    quoted = false,
    escape = false;
  const stack: number[] = [];
  const whitespace = (b: number) => b === 32 || b === 9 || b === 10 || b === 13;
  const emit = () => {
    if (++count > maxEntries)
      throw new Error("Too many entries in streamed metadata.");
    entry(JSON.parse(decoder.decode(buffer.subarray(0, used))), count - 1);
    used = 0;
  };
  return {
    push(bytes: Buffer) {
      for (const b of bytes) {
        if (state === "prefix") {
          if (b === 91) {
            // Explicit literal assignment supplied by provider, flexible whitespace
            // around = only. BOM accepted solely at the start of the document.
            const trimmed = head.replace(/^\xef\xbb\xbf/, "").trim();
            if (prefix !== null && trimmed.replace(/\s*=\s*$/, " =") !== prefix)
              throw new Error(
                "Unsupported archive wrapper or filename/part mismatch. No code was executed.",
              );
            state = "first";
          } else {
            // Bare JSON admits only RFC JSON whitespace before the array. A
            // script envelope is opt-in and must be supplied by its adapter.
            if (prefix === null && !whitespace(b))
              throw new Error(
                "Expected a plain JSON array without an archive wrapper.",
              );
            if (
              head.length >= 256 ||
              (b > 127 && !(head.length < 3 && [239, 187, 191].includes(b)))
            )
              throw new Error("Unsupported or oversized metadata envelope.");
            head += String.fromCharCode(b);
          }
          continue;
        }
        if (state === "tail" || state === "end") {
          if (whitespace(b)) continue;
          if (prefix !== null && state === "tail" && b === 59) {
            state = "end";
            continue;
          }
          throw new Error(
            "Unexpected content after metadata array. No code was executed.",
          );
        }
        if (state === "between") {
          if (whitespace(b)) continue;
          if (b === 44) {
            state = "next";
            continue;
          }
          if (b === 93) {
            state = "tail";
            continue;
          }
          throw new Error("Expected metadata array separator.");
        }
        if (state === "first" || state === "next") {
          if (whitespace(b)) continue;
          if (state === "first" && b === 93) {
            state = "tail";
            continue;
          }
          if (b === 93 || b === 44)
            throw new Error("Empty metadata entry or trailing comma.");
          state = "item";
        }
        if (!quoted && !stack.length && (b === 44 || b === 93)) {
          emit();
          state = b === 44 ? "next" : "tail";
          continue;
        }
        if (used >= buffer.length)
          throw new Error("Metadata entry exceeds the 1 MiB streaming limit.");
        buffer[used++] = b;
        if (quoted) {
          if (escape) escape = false;
          else if (b === 92) escape = true;
          else if (b === 34) quoted = false;
        } else if (b === 34) quoted = true;
        else if (b === 123 || b === 91) {
          if (stack.length >= 128)
            throw new Error("Metadata nesting exceeds the streaming limit.");
          stack.push(b === 123 ? 125 : 93);
        } else if (b === 125 || b === 93) {
          if (stack.pop() !== b)
            throw new Error("Mismatched metadata brackets.");
          if (!stack.length) {
            emit();
            state = "between";
          }
        }
      }
    },
    finish() {
      if (state !== "tail" && state !== "end")
        throw new Error("Incomplete metadata array.");
      return count;
    },
  };
}
