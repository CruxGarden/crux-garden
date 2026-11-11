const { fixture } = require("./cloud-fixture.cjs");
const json = (res, value) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
async function gmailFixture(t, options = {}) {
  const calls = [];
  const state = {
    history: "10",
    email: "mailbox@example.test",
    failId: null,
    rawOverride: undefined,
    labelName: "Family",
    afterRaw: false,
    ...options.state,
  };
  const data = new Map([
    [
      "aa",
      Buffer.from(
        "From: sender@example.test\r\nSubject: First <img src=x>\r\nMessage-ID: <same@example.test>\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Transfer-Encoding: base64\r\n\r\nYWJj\r\n--x--\r\n",
      ),
    ],
    [
      "bb",
      Buffer.from(
        "Subject: Second\nMessage-ID: <same@example.test>\n\nKeep this too\n",
      ),
    ],
    [
      "cc",
      Buffer.from("Subject: Spam fixture\n\nNot in selected Family label\n"),
    ],
  ]);
  const metadata = (key) => ({
    id: key,
    threadId: "thread1",
    historyId: state.history,
    internalDate: "0",
    labelIds:
      key === "cc"
        ? ["SPAM"]
        : key === "aa"
          ? ["INBOX", "Label_1"]
          : ["Label_1"],
    payload: {
      headers: [
        {
          name: "Subject",
          value:
            key === "aa"
              ? "First <img src=x>"
              : key === "bb"
                ? "Second"
                : "Spam fixture",
        },
      ],
    },
  });
  const f = await fixture(t, {
    http(url, req, res) {
      calls.push({
        host: url.hostname,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: req.headers.authorization,
      });
      if (url.hostname === "oauth2.googleapis.com") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const args = Object.fromEntries(new URLSearchParams(body));
          calls.push({ token: args });
          return json(res, {
            access_token: "gmail-access-secret",
            refresh_token: "gmail-refresh-secret",
            expires_in:
              options.expired && args.grant_type === "authorization_code"
                ? 0
                : 3600,
            scope:
              options.scope || "https://www.googleapis.com/auth/gmail.readonly",
          });
        });
        return;
      }
      if (req.headers.authorization !== "Bearer gmail-access-secret") {
        res.writeHead(403);
        return res.end();
      }
      if (url.pathname.endsWith("/profile"))
        return json(res, {
          emailAddress: state.email,
          messagesTotal: 3,
          threadsTotal: 1,
          historyId: state.history,
        });
      if (url.pathname.endsWith("/labels"))
        return json(res, {
          labels: [
            { id: "INBOX", name: "INBOX", type: "system" },
            { id: "Label_1", name: state.labelName, type: "user" },
            { id: "SPAM", name: "SPAM", type: "system" },
          ],
        });
      if (url.pathname.endsWith("/messages")) {
        const label = url.searchParams.get("labelIds");
        const keys =
          label === "INBOX"
            ? ["aa"]
            : label === "SPAM"
              ? ["cc"]
              : label === "Label_1"
                ? ["aa", "bb"]
                : ["aa", "bb", "cc"];
        const index = Number(url.searchParams.get("pageToken") || 0);
        return json(res, {
          messages: keys
            .slice(index, index + 1)
            .map((id) => ({ id, threadId: "thread1" })),
          ...(index + 1 < keys.length
            ? { nextPageToken: state.repeatCursor ? "1" : String(index + 1) }
            : {}),
        });
      }
      const key = url.pathname.split("/").at(-1);
      if (!data.has(key) || state.failId === key) {
        res.writeHead(404);
        return res.end();
      }
      if (url.searchParams.get("format") === "raw") {
        if (state.oversizedResponse) {
          res.writeHead(200, { "content-length": 96 * 1024 ** 2 + 1 });
          res.end("{}");
          return;
        }
        const value = {
          ...metadata(key),
          raw:
            state.rawOverride === undefined
              ? data.get(key).toString("base64url")
              : state.rawOverride,
        };
        if (state.changeDuringRaw) state.history = "11";
        return json(res, value);
      }
      return json(res, {
        ...metadata(key),
        ...(state.missingDate ? { internalDate: undefined } : {}),
      });
    },
  });
  async function complete(auth) {
    const url = new URL(auth.authorizationUrl);
    const callback = new URL(url.searchParams.get("redirect_uri"));
    callback.search = new URLSearchParams({
      code: "fixture-code",
      state: url.searchParams.get("state"),
    });
    await fetch(callback);
    return (await f.call("cloudStatus")).find((c) => c.id === auth.id);
  }
  async function connect() {
    return complete(
      await f.call("cloudAuthorize", {
        provider: "Gmail",
        clientId: "fixture.apps.googleusercontent.com",
        clientSecret: "gmail-desktop-secret",
      }),
    );
  }
  return { ...f, calls, state, data, complete, connect };
}
module.exports = { gmailFixture };
