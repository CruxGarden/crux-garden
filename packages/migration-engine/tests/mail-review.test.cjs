const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { photoFixture } = require("./photo-fixture.cjs");
const mail = (subject = "Synthetic <script>mail</script>", nl = "\n") =>
  [
    "From sender@example.test Sat Jan 01 00:00:00 2022",
    "From: sender@example.test",
    "Date: Sat, 1 Jan 2022 00:00:00 +0000",
    "Message-ID: <fixture@example.test>",
    `Subject: ${subject}`,
    "X-Gmail-Labels: Inbox,Family",
    " folded-value",
    'Content-Type: multipart/mixed; boundary="fixture"',
    "",
    "--fixture",
    "Content-Type: application/octet-stream",
    "Content-Transfer-Encoding: base64",
    "",
    "YWJj",
    "--fixture--",
    ">From escaped body",
    "",
    "",
  ].join(nl);
async function waitMail(runtime, id) {
  for (let n = 0; n < 500; n++) {
    const job = (await runtime.request("list")).find((j) => j.id === id);
    if (job.mailReview?.state !== "running") return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Mail fixture timeout");
}
async function review(f) {
  await f.runtime.request("mailReview", { id: f.job.id });
  return waitMail(f.runtime, f.job.id);
}
async function report(job) {
  return JSON.parse(
    await fs.readFile(path.join(job.output, job.mailReview.report), "utf8"),
  );
}
test("mail inventory streams CRLF and folded labels, preserves MIME bytes and persists across restart", async (t) => {
  const raw = mail() + mail("=?UTF-8?B?5pel5pys6Kqe?=", "\r\n");
  const f = await photoFixture(
    t,
    { "Mail/all.mbox": raw, "settings.json": "{}" },
    "Gmail",
  );
  const before = await fs.readFile(path.join(f.job.output, "report.json"));
  const done = await review(f);
  assert.equal(done.mailReview.state, "complete", done.mailReview.error);
  assert.deepEqual(done.mailReview.counts, {
    mailboxes: 1,
    checked: 1,
    invalid: 0,
    candidates: 2,
    warnings: 0,
    labelHeaders: 2,
  });
  const r = await report(done);
  assert.equal(r.results[0].preview[0].labels[0], "Inbox,Family folded-value");
  assert.equal(r.results[0].preview[1].offset, Buffer.byteLength(mail()));
  assert.equal(r.results[0].preview[1].subject, "=?UTF-8?B?5pel5pys6Kqe?=");
  assert.deepEqual(r.uninterpretedFiles, ["settings.json"]);
  assert.equal(
    await fs.readFile(path.join(done.output, "files/Mail/all.mbox"), "utf8"),
    raw,
  );
  assert.deepEqual(
    await fs.readFile(path.join(done.output, "report.json")),
    before,
  );
  await f.restart();
  assert.deepEqual(
    (await f.runtime.request("list"))[0].mailReview,
    done.mailReview,
  );
});
test("changed and linked mailboxes never publish unverified header previews", async (t) => {
  const f = await photoFixture(
    t,
    { "a.mbox": mail(), "b.mbox": mail() },
    "Gmail",
  );
  await fs.writeFile(
    path.join(f.job.output, "files/a.mbox"),
    mail().replace("Inbox", "Other"),
  );
  await fs.unlink(path.join(f.job.output, "files/b.mbox"));
  await fs.symlink(
    path.join(f.source, "b.mbox"),
    path.join(f.job.output, "files/b.mbox"),
  );
  const done = await review(f);
  assert.equal(done.mailReview.counts.invalid, 2);
  assert.equal(done.mailReview.counts.candidates, 0);
  assert.ok((await report(done)).results.every((r) => !r.preview));
});
test("mail parser bounds long body lines and headers, flags truncated and ambiguous separators", async (t) => {
  const raw =
    mail() +
    "x".repeat(2 * 1024 * 1024) +
    "\nFrom body line\nnot a header\n\ntext\n" +
    mail("end") +
    "From truncated separator\nSubject: " +
    "h".repeat(70 * 1024);
  const f = await photoFixture(t, { "long.mbox": raw }, "Gmail");
  const done = await review(f);
  assert.equal(done.mailReview.counts.candidates, 4);
  assert.equal(done.mailReview.counts.warnings, 2);
  const r = await report(done);
  assert.equal(r.results[0].preview[2].subject, "end");
  assert.match(r.results[0].preview[3].issue, /64 KiB/);
});
test("mail review has bounded previews, explicit empty/unsupported files and no ID deduplication", async (t) => {
  const f = await photoFixture(
    t,
    {
      "many.mbox": mail().repeat(220),
      "empty.mbox": "",
      "not-mail.mbox": "ordinary text",
      "notes.txt": "keep",
    },
    "Gmail",
  );
  const done = await review(f);
  assert.equal(done.mailReview.counts.candidates, 220);
  assert.equal(done.mailReview.counts.warnings, 1);
  const r = await report(done);
  assert.equal(
    r.results.find((f) => f.path === "many.mbox").preview.length,
    50,
  );
  const empty = await photoFixture(t, { "settings.json": "{}" }, "Gmail");
  assert.equal((await review(empty)).mailReview.counts.mailboxes, 0);
});
test("mail review pauses and retries separately from preservation, rejects concurrent mutation and unready sources", async (t) => {
  const f = await photoFixture(t, { "all.mbox": mail().repeat(2000) }, "Gmail");
  await f.runtime.request("mailReview", { id: f.job.id });
  await assert.rejects(
    f.runtime.request("mailReview", { id: f.job.id }),
    /Pause/,
  );
  await assert.rejects(
    f.runtime.request("source", { id: f.job.id, path: f.source }),
    /Pause/,
  );
  await f.runtime.request("pause", { id: f.job.id });
  assert.equal(
    (await waitMail(f.runtime, f.job.id)).mailReview.state,
    "paused",
  );
  assert.equal((await review(f)).mailReview.counts.candidates, 2000);
  const unready = await f.runtime.request("create", { provider: "Gmail" });
  await assert.rejects(
    f.runtime.request("mailReview", { id: unready.id }),
    /Preserve and verify/,
  );
  const other = await photoFixture(t, { "a.mbox": mail() }, "Flickr");
  await assert.rejects(review(other), /Preserve and verify/);
});
test("mail receipt path validation rejects traversal before reviewing any mailbox", async (t) => {
  const f = await photoFixture(t, { "all.mbox": mail() }, "Gmail");
  const p = path.join(f.job.output, "report.json");
  const receipt = JSON.parse(await fs.readFile(p));
  receipt.files[0].path = "../escape.mbox";
  await fs.writeFile(p, JSON.stringify(receipt));
  const done = await review(f);
  assert.equal(done.mailReview.state, "failed");
  assert.match(done.mailReview.error, /safely preserved/);
});
module.exports = { mail, waitMail };

test("mail review handles separators crossing read chunks and caps the overall report preview", async (t) => {
  const head = mail();
  const pad = "x".repeat(65533 - Buffer.byteLength(head)) + "\n";
  const entries = {};
  for (let i = 0; i < 5; i++)
    entries[`${i}.mbox`] = head + pad + mail().repeat(51);
  const f = await photoFixture(t, entries, "Gmail");
  const done = await review(f);
  assert.equal(done.mailReview.counts.candidates, 260);
  assert.equal(done.mailReview.counts.warnings, 0);
  const r = await report(done);
  assert.equal(
    r.results.reduce((n, f) => n + f.preview.length, 0),
    200,
  );
  assert.equal(r.results[0].preview[1].offset, 65534);
});
test("mail review local API is authenticated and starts the same durable background job", async (t) => {
  const { startLocalApi } = require("../dist/http.cjs");
  const f = await photoFixture(t, { "a.mbox": mail() }, "Gmail");
  const api = await startLocalApi(f.runtime);
  t.after(() => api.close());
  const url = api.url + `/v1/jobs/${f.job.id}/mailReview`;
  const denied = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const accepted = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + api.token,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(accepted.status, 200);
  assert.equal(
    (await waitMail(f.runtime, f.job.id)).mailReview.counts.candidates,
    1,
  );
});
