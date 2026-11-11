# Local Migration API v1

The desktop service listens on an ephemeral `127.0.0.1` port. Its selected profile contains `local-api.json`, mode 0600 on macOS/Linux, with `url`, `token`, `pid`, and `version`. Treat this file as a credential. It is removed on graceful shutdown and its token changes on each start. The API is local only and rejects browser Origin headers and unexpected Host headers; CORS is not enabled.

Every request requires `Authorization: Bearer <token>`. POST requests require `Content-Type: application/json`, a JSON object, and at most 150,000 bytes. Responses are `{ "result": ... }` or `{ "error": "..." }`. This initial API uses 200, 400, 403 and 404 status codes.

| Method | Path                       | Body / result                                                                                                                |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/info`                 | Product/runtime, Mood, zero-Crux check                                                                                       |
| GET    | `/v1/providers`            | Bundled guide catalog                                                                                                        |
| GET    | `/v1/jobs`                 | Current job snapshots and progress                                                                                           |
| POST   | `/v1/jobs`                 | `{ "provider": "Dropbox" }` → new job                                                                                        |
| POST   | `/v1/jobs/:id/source`      | `{ "path": "/absolute/export" }` (folder or supported archive)                                                               |
| POST   | `/v1/jobs/:id/archiveSet`  | `{ "paths": ["/absolute/exports/part-1.zip", "/absolute/exports/part-2.zip"] }` — 1–500 independent archives from one folder |
| POST   | `/v1/jobs/:id/destination` | `{ "path": "/absolute/copies" }`                                                                                             |
| POST   | `/v1/jobs/:id/inspect`     | `{}` → begin review                                                                                                          |
| POST   | `/v1/jobs/:id/start`       | `{}` → preserve/resume after review                                                                                          |
| POST   | `/v1/jobs/:id/pause`       | `{}` → request cooperative pause                                                                                             |
| POST   | `/v1/jobs/:id/checklist`   | `{ "step": "catalog-step-id", "checked": true }`                                                                             |

Poll `/v1/jobs` for this slice; event subscriptions are not implemented. `inspect`/`start` acknowledge scheduling rather than completion; check the job's state. Clients must not infer success from HTTP 200 alone. Source/destination changes are rejected after copying begins.

Native clients holding the token may choose filesystem paths within the same safe migration rules. The desktop renderer cannot: its host grants paths through file pickers. No arbitrary SQL, shell execution, URL fetching, account deletion, or source deletion endpoint exists.

To run without a window, build first, then run the packaged Node service with an absolute, dedicated profile path:

```sh
apps/migration/runtime-dist/node apps/migration/runtime-dist/backend.cjs --serve /absolute/migration-test-profile
```

Stop with Ctrl-C. Do not point another service at a profile already owned by a running desktop app. No cloud connection or files are copied until explicit job commands are submitted.

The first network connector adds authenticated download endpoints; see [Dropbox downloads](dropbox-downloads.md#local-api-and-embedding). The renderer never gains direct filesystem or unauthenticated HTTP access.

## Cloud collections

These routes share the same authentication/body/Origin/Host checks:

| Method | Path                      | Arguments / result                                                                                                                                               |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/cloud/connections`   | Non-secret connection status                                                                                                                                     |
| GET    | `/v1/cloud/jobs`          | Job summaries, comparison counts and reused-file counts                                                                                                          |
| POST   | `/v1/cloud/connect`       | `provider: Bluesky`, `handle`; or `provider: Amazon S3`, `bucket`, `region`, `accessKeyId`, `secretAccessKey`, optional `sessionToken`                           |
| POST   | `/v1/cloud/authorize`     | `provider: Google Drive`, `clientId`, optional `clientSecret`; returns connection ID and constructed Google authorization URL for trusted native clients to open |
| POST   | `/v1/cloud/browse`        | `connection`, optional previously listed `parent`, optional `cursor`                                                                                             |
| POST   | `/v1/cloud/create`        | `connection`, `selected` array of listed entry IDs                                                                                                               |
| POST   | `/v1/cloud/destination`   | `id`, absolute `path`; new dedicated export folder                                                                                                               |
| POST   | `/v1/cloud/scanDirectory` | `id`, `connection`, absolute local `path`; starts discovery/local fingerprint scan/comparison                                                                    |
| POST   | `/v1/cloud/start`         | `id`, `connection`; schedules discovery/download or retry                                                                                                        |
| POST   | `/v1/cloud/pause`         | `id`; cooperatively stops work                                                                                                                                   |
| POST   | `/v1/cloud/import`        | `id`; completed export becomes an ordinary preservation source                                                                                                   |
| POST   | `/v1/cloud/disconnect`    | `connection`; stop using in-memory credentials (pause active work first)                                                                                         |

Native renderers use injected commands but cannot call destination or scanDirectory directly: `pick(id, kind, { connection })` grants the selected path. `cloudAuthorize` opens only the engine-constructed Google authorization URL in the system browser. No runtime test transport or adapter override is remotely configurable. The comparison result records the scanned folder and scan timestamp; matching counts may also include verified locations already indexed from earlier jobs. `uncertain` means no matching known location and no supported remote checksum, so downloading is needed for proof. Scan itself never downloads file content or changes the source.
