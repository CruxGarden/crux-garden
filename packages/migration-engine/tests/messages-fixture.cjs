// Synthetic readable-copy fixture, never exported from a personal account.
const stream =
  "BT /F1 12 Tf 40 750 Td (Synthetic conversation copy - partial selection) Tj ET\n";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
];
let pdf = "%PDF-1.4\n",
  offsets = [0];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const start = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets
  .slice(1)
  .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
  .join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
const data = {
  "Conversation.pdf": pdf,
  "Attachment.txt":
    "Independently saved synthetic attachment. No automatic message relationship.\n",
  "Collection-notes.txt":
    "Synthetic fixture; chosen conversation range only. Earlier history and attachment relationships unverified.\n",
};
module.exports = { data, names: Object.keys(data) };
