const { fixture } = require("./cloud-fixture.cjs");
const { createHash } = require("node:crypto");
const hash = (data) => {
  const outer = createHash("sha256");
  for (let i = 0; i < data.length; i += 4194304)
    outer.update(
      createHash("sha256")
        .update(data.subarray(i, i + 4194304))
        .digest(),
    );
  return outer.digest("hex");
};
const json = (res, value) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
async function dropboxFixture(t, options = {}) {
  const calls = [];
  const bytes = options.bytes || Buffer.from("Dropbox fixture content");
  const folder = {
    ".tag": "folder",
    id: "id:folder",
    name: "Trips",
    path_lower: "/trips",
    path_display: "/Trips",
  };
  const one = {
    ".tag": "file",
    id: "id:one",
    name: "café 📷.jpg",
    path_lower: "/trips/café 📷.jpg",
    path_display: "/Trips/café 📷.jpg",
    rev: "123456789",
    size: bytes.length,
    content_hash: hash(bytes),
    is_downloadable: true,
  };
  const two = {
    ...one,
    id: "id:two",
    name: "second.jpg",
    path_lower: "/trips/second.jpg",
    path_display: "/Trips/second.jpg",
  };
  const spare = {
    ...one,
    id: "id:spare",
    name: "unselected.txt",
    path_lower: "/unselected.txt",
    path_display: "/unselected.txt",
  };
  const state = {
    folder,
    one,
    two,
    spare,
    wrongHeader: false,
    badBytes: false,
    repeated: false,
    slow: false,
    refresh: false,
    denied: false,
  };
  let f = await fixture(t, {
    http(url, req, res) {
      const chunks = [];
      req.on("data", (v) => chunks.push(v));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString();
          const args = url.pathname.includes("oauth2/token")
            ? Object.fromEntries(new URLSearchParams(raw))
            : raw
              ? JSON.parse(raw)
              : {};
          calls.push({
            path: url.pathname,
            host: url.host,
            method: req.method,
            args,
            headers: { ...req.headers },
          });
          if (url.pathname === "/oauth2/token")
            return json(res, {
              access_token: "fixture-dropbox-token",
              refresh_token: "fixture-dropbox-refresh",
              expires_in:
                state.refresh && args.grant_type === "authorization_code"
                  ? 0
                  : 14400,
              scope: state.denied
                ? "files.metadata.read"
                : "files.metadata.read files.content.read account_info.read",
            });
          if (url.pathname === "/2/users/get_current_account")
            return json(res, {
              account_id: "dbid:fixture",
              root_info: { home_namespace_id: "123" },
            });
          if (url.pathname === "/2/files/get_metadata")
            return json(
              res,
              [folder, one, two, spare].find((v) => v.id === args.path),
            );
          if (url.pathname === "/2/files/list_folder")
            return json(
              res,
              args.path === ""
                ? {
                    entries: [folder, spare],
                    cursor: "root-end",
                    has_more: false,
                  }
                : { entries: [one], cursor: "next", has_more: true },
            );
          if (url.pathname === "/2/files/list_folder/continue")
            return json(res, {
              entries: [two],
              cursor: state.repeated ? "next" : "end",
              has_more: state.repeated,
            });
          if (url.pathname === "/2/files/download") {
            const arg = JSON.parse(req.headers["dropbox-api-arg"]);
            const v = [one, two, spare].find((v) => v.id === arg.path);
            const result = {
              ...v,
              rev: state.wrongHeader ? "987654321" : v.rev,
            };
            delete result[".tag"];
            res.writeHead(200, {
              "content-length": bytes.length,
              "dropbox-api-result": JSON.stringify(result).replace(
                /[\u007f-\uffff]/g,
                (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
              ),
            });
            const data = state.badBytes
              ? Buffer.alloc(bytes.length, 120)
              : bytes;
            if (!state.slow) return res.end(data);
            let i = 0;
            const timer = setInterval(() => {
              if (i >= data.length) {
                clearInterval(timer);
                res.end();
                return;
              }
              res.write(data.subarray(i, i + 65536));
              i += 65536;
            }, 5);
            res.on("close", () => clearInterval(timer));
            return;
          }
          res.writeHead(404);
          res.end();
        } catch {
          res.writeHead(500);
          res.end();
        }
      });
    },
  });
  async function authorize() {
    return f.call("cloudAuthorize", {
      provider: "Dropbox",
      clientId: "fixtureAppKey",
    });
  }
  async function complete(auth) {
    const url = new URL(auth.authorizationUrl),
      callback = new URL(url.searchParams.get("redirect_uri"));
    callback.search = new URLSearchParams({
      code: "fixture-dropbox-code",
      state: url.searchParams.get("state"),
    });
    await fetch(callback);
    return (await f.call("cloudStatus")).find((c) => c.id === auth.id);
  }
  async function connect() {
    return complete(await authorize());
  }
  return { ...f, calls, state, bytes, authorize, complete, connect };
}
module.exports = { dropboxFixture };
