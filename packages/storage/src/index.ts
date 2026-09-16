import { HeadObjectCommand, PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`STORAGE_CONFIG_MISSING:${name}`);
  return value;
}

const endpoint = process.env.S3_ENDPOINT;
const client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
  credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  } : undefined,
});

export type StorageUploadIntent = { storageKey: string; uploadUrl: string; expiresIn: number };

export async function createUploadUrl(input: { storageKey: string; mimeType: string; expiresIn?: number }): Promise<StorageUploadIntent> {
  const expiresIn = input.expiresIn ?? 900;
  const command = new PutObjectCommand({ Bucket: required("S3_BUCKET"), Key: input.storageKey, ContentType: input.mimeType });
  return { storageKey: input.storageKey, uploadUrl: await getSignedUrl(client, command, { expiresIn }), expiresIn };
}

export async function createDownloadUrl(storageKey: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: storageKey }), { expiresIn });
}

export async function headObject(storageKey: string): Promise<{ sizeBytes: number; mimeType: string | undefined }> {
  const output = await client.send(new HeadObjectCommand({ Bucket: required("S3_BUCKET"), Key: storageKey }));
  if (output.ContentLength === undefined) throw new Error("STORAGE_OBJECT_SIZE_MISSING");
  return { sizeBytes: output.ContentLength, mimeType: output.ContentType };
}

export function storageKeyFor(orgId: string, userId: string, fileId: string, name: string): string {
  const safe = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "file";
  return `org/${orgId}/files/${userId}/${fileId}/${safe}`;
}
