/** Streaming inventory only. MBOX variants make separator-based counts provisional.
 * Never split/rewrite messages or use Message-ID/headers as content fingerprints.
 */
export interface MailPreview {
  offset: number;
  subject?: string;
  date?: string;
  messageId?: string;
  labels?: string[];
  issue?: string;
}
export function mboxInventory() {
  const maxHeader = 64 * 1024;
  const prefix = Buffer.alloc(maxHeader);
  let kept = 0,
    lineBytes = 0,
    offset = 0,
    lineOffset = 0;
  let current: MailPreview | undefined;
  let inHeaders = false,
    headerBytes = 0,
    last = "",
    endedHeaders = false;
  let candidates = 0,
    warnings = 0,
    labelHeaders = 0,
    preamble = false;
  const preview: MailPreview[] = [];
  const fields = new Map<string, string[]>();
  function issue(text: string) {
    if (current && !current.issue) current.issue = text;
  }
  function finish() {
    if (!current) return;
    if (!endedHeaders)
      issue("No complete header/body separator; record may be truncated.");
    if (!fields.has("from") && !fields.has("date") && !fields.has("message-id"))
      issue("No identifying message headers; separator may be body text.");
    current.subject = fields.get("subject")?.[0]?.slice(0, 512);
    current.date = fields.get("date")?.[0]?.slice(0, 512);
    current.messageId = fields.get("message-id")?.[0]?.slice(0, 512);
    current.labels = fields
      .get("x-gmail-labels")
      ?.map((v) => v.slice(0, 512))
      .slice(0, 8);
    if (current.issue) warnings++;
    if (fields.has("x-gmail-labels")) labelHeaders++;
    if (preview.length < 50) preview.push(current);
  }
  function line() {
    const text = prefix
      .subarray(0, kept)
      .toString("utf8")
      .replace(/\r?\n$/, "");
    if (text.startsWith("From ")) {
      finish();
      if (++candidates > 2_000_000)
        throw new Error(
          "Mailbox exceeds the two-million candidate review limit.",
        );
      current = { offset: lineOffset };
      fields.clear();
      last = "";
      inHeaders = true;
      endedHeaders = false;
      headerBytes = 0;
      if (lineBytes > 4096 || !/^From \S+ .+/.test(text))
        issue("Unusual separator; message boundary is uncertain.");
    } else if (!current) {
      if (lineBytes) preamble = true;
    } else if (inHeaders) {
      headerBytes += lineBytes;
      if (headerBytes > maxHeader) {
        issue(
          "Header block exceeds 64 KiB; remaining headers were not interpreted.",
        );
        inHeaders = false;
      } else if (!text) {
        endedHeaders = true;
        inHeaders = false;
      } else if (/^[ \t]/.test(text)) {
        const values = fields.get(last);
        if (!values) issue("Unrecognized header continuation.");
        else values[values.length - 1] += " " + text.trim();
      } else {
        const match = /^([!-9;-~]+):[ \t]*(.*)$/.exec(text);
        if (!match) {
          issue("Malformed header; separator may be body text.");
          last = "";
        } else {
          last = match[1]!.toLowerCase();
          const values = fields.get(last) || [];
          values.push(match[2]!);
          fields.set(last, values);
          if (
            values.length > 1 &&
            ["subject", "date", "message-id", "from"].includes(last)
          )
            issue(
              "Repeated identifying header; no preferred identity inferred.",
            );
        }
      }
    }
    kept = 0;
    lineBytes = 0;
    lineOffset = offset;
  }
  return {
    push(chunk: Buffer) {
      let pos = 0;
      while (pos < chunk.length) {
        const newline = chunk.indexOf(10, pos);
        const end = newline < 0 ? chunk.length : newline + 1;
        const count = end - pos;
        const copy = Math.min(count, maxHeader - kept);
        chunk.copy(prefix, kept, pos, pos + copy);
        kept += copy;
        lineBytes += count;
        offset += count;
        pos = end;
        if (newline >= 0) line();
      }
    },
    finish() {
      if (lineBytes) line();
      finish();
      return { candidates, warnings, labelHeaders, preamble, preview };
    },
  };
}
