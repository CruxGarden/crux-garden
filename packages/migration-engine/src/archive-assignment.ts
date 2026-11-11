// Archive assignments are inert envelopes around JSON, never JavaScript to run.
export function decodeArchiveAssignment(
  text: string,
  name: string,
  part: string,
): unknown {
  const raw = text.trim();
  const prefix =
    /^window\.YTD\.(tweets|tweet)\.part(0|[1-9]\d{0,5})\s*=\s*/.exec(raw);
  if (!prefix || prefix[1] !== name || prefix[2] !== part)
    throw new Error(
      "Unsupported archive wrapper or filename/part mismatch. No code was executed.",
    );
  const body = raw.slice(prefix[0].length).replace(/;\s*$/, "");
  return JSON.parse(body);
}
