import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Readable } from "node:stream";
import type { CloudAdapter } from "./common";
import { CloudError, textField } from "./common";
import type { CloudEntry, CloudItem } from "@cruxgarden/migration-contracts";
export type S3Factory = (
  config: ConstructorParameters<typeof S3Client>[0],
) => Pick<S3Client, "send" | "destroy">;
export async function s3(
  input: Record<string, unknown>,
  signal: AbortSignal,
  factory: S3Factory = (config) => new S3Client(config ?? {}),
): Promise<CloudAdapter> {
  const bucket = textField(input.bucket, "an S3 bucket name", 63);
  const region = textField(input.region, "the bucket's AWS region", 40);
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes("..") ||
    bucket.endsWith("--x-s3")
  )
    throw new CloudError("Use an ordinary AWS S3 bucket name.");
  if (!/^(us|eu|ap|sa|ca|me|af|il|mx)-(?:[a-z]+-)?[a-z]+-\d$/.test(region))
    throw new CloudError("Enter a commercial AWS region such as us-east-1.");
  const credentials = {
    accessKeyId: textField(input.accessKeyId, "an AWS access key ID", 256),
    secretAccessKey: textField(
      input.secretAccessKey,
      "an AWS secret access key",
      1024,
    ),
    ...(input.sessionToken
      ? {
          sessionToken: textField(
            input.sessionToken,
            "the session token",
            8192,
          ),
        }
      : {}),
  };
  const client = factory({
    region,
    credentials,
    endpoint: `https://s3.${region}.amazonaws.com`,
    forcePathStyle: true,
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 15000,
      socketTimeout: 30000,
    }),
  });
  const list = async (
    prefix: string,
    cursor: string | undefined,
    delimiter: string | undefined,
    sig: AbortSignal,
  ) =>
    client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        Delimiter: delimiter,
        MaxKeys: 500,
      }),
      { abortSignal: sig },
    );
  try {
    await list("", undefined, "/", signal);
  } catch {
    client.destroy();
    throw new CloudError(
      "Could not read this bucket. Check its region, credentials and ListBucket permission.",
    );
  }
  const entry = (key: string, size?: number): CloudEntry => ({
    id: `file:${key}`,
    name: key.split("/").at(-1) || key,
    kind: "file",
    size,
  });
  const item = (v: any): CloudItem => {
    if (
      typeof v.Key !== "string" ||
      !Number.isSafeInteger(v.Size) ||
      v.Size < 0 ||
      typeof v.ETag !== "string"
    )
      throw new CloudError("The bucket returned incomplete object metadata.");
    return {
      id: v.Key,
      path: v.Key,
      size: v.Size,
      revision: v.ETag,
      metadata: {
        key: v.Key,
        etag: v.ETag,
        storageClass: v.StorageClass,
        modified: v.LastModified?.toISOString(),
      },
    };
  };
  return {
    provider: "Amazon S3",
    identity: `s3:${region}:${bucket}`,
    label: bucket,
    notes: [
      "Selected current objects only; historical versions, delete markers, bucket policies, ACLs and tags are not exported.",
      "Archived objects must already be restored. Downloads may incur AWS request and data-transfer charges. Multipart ETags are treated as version validators, never as MD5 checksums.",
    ],
    async browse(parent, cursor, sig) {
      if (parent && !parent.startsWith("folder:"))
        throw new CloudError("Choose an S3 folder.");
      const page = await list(parent.slice(7), cursor, "/", sig);
      return {
        entries: [
          ...(page.CommonPrefixes ?? []).map((p: any) => ({
            id: `folder:${p.Prefix}`,
            name: String(p.Prefix).replace(/\/$/, "").split("/").at(-1)!,
            kind: "folder" as const,
          })),
          ...(page.Contents ?? [])
            .filter((v: any) => !v.Key?.endsWith("/"))
            .map((v: any) => entry(v.Key, v.Size)),
        ],
        cursor: page.IsTruncated ? page.NextContinuationToken : undefined,
      };
    },
    async *discover(selection, sig) {
      for (const selected of selection) {
        const folder = selected.kind === "folder";
        const prefix = selected.id.slice(folder ? 7 : 5);
        let cursor: string | undefined;
        const seen = new Set<string>();
        let found = false;
        do {
          const page = await list(prefix, cursor, undefined, sig);
          for (const v of page.Contents ?? []) {
            if (v.Key?.endsWith("/")) continue;
            if (!folder && v.Key !== prefix) continue;
            found = true;
            yield item(v);
          }
          if (!folder) break;
          cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
          if (page.IsTruncated && (!cursor || seen.has(cursor)))
            throw new CloudError("The bucket repeated its listing cursor.");
          if (cursor) seen.add(cursor);
        } while (cursor);
        if (!folder && !found)
          throw new CloudError(
            "A selected object disappeared. Create a new selection.",
          );
      }
    },
    async checksum(v, sig) {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: v.id,
          IfMatch: v.revision,
          ChecksumMode: "ENABLED",
        }),
        { abortSignal: sig },
      );
      if (head.ETag !== v.revision || head.ContentLength !== v.size)
        throw new CloudError(
          "A selected object changed. Create a new selection.",
        );
      if (head.ChecksumType === "FULL_OBJECT" && head.ChecksumSHA256)
        v.checksum = {
          algorithm: "sha256",
          hex: Buffer.from(head.ChecksumSHA256, "base64").toString("hex"),
        };
    },
    async read(v, sig) {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: v.id,
          IfMatch: v.revision,
          ChecksumMode: "ENABLED",
        }),
        { abortSignal: sig },
      );
      if (
        !res.Body ||
        res.ETag !== v.revision ||
        res.ContentLength !== v.size
      ) {
        (res.Body as Readable | undefined)?.destroy();
        throw new CloudError(
          "A selected object changed. Create a new selection.",
        );
      }
      if (res.ChecksumType === "FULL_OBJECT" && res.ChecksumSHA256)
        v.checksum = {
          algorithm: "sha256",
          hex: Buffer.from(res.ChecksumSHA256, "base64").toString("hex"),
        };
      v.metadata = {
        ...v.metadata,
        versionId: res.VersionId,
        contentType: res.ContentType,
        userMetadata: res.Metadata,
      };
      return { body: res.Body as Readable, size: res.ContentLength };
    },
    close() {
      client.destroy();
    },
  };
}
