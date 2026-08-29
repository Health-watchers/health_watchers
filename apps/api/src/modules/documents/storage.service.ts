import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@health-watchers/config';

const PRESIGN_EXPIRES_SECONDS = 15 * 60; // 15 minutes

// ── S3 client (lazy) ────────────────────────────────────────────────────────
let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: config.storage.s3Region,
      credentials: {
        accessKeyId: config.storage.s3AccessKey,
        secretAccessKey: config.storage.s3SecretKey,
      },
    });
  }
  return _s3;
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function uploadFile(params: {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
  encrypt?: boolean;
}): Promise<void> {
  if (config.storage.driver === 's3') {
    await s3().send(
      new PutObjectCommand({
        Bucket: config.storage.s3Bucket,
        Key: params.storageKey,
        Body: params.buffer,
        ContentType: params.mimeType,
        ...(params.encrypt !== false && {
          ServerSideEncryption: 'AES256',
        }),
      })
    );
  } else {
    // Local disk
    const dest = path.join(config.storage.localUploadDir, params.storageKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, params.buffer);
  }
}

// ── Download / pre-signed URL ────────────────────────────────────────────────

export async function getDownloadUrl(storageKey: string): Promise<string> {
  if (config.storage.driver === 's3') {
    const cmd = new GetObjectCommand({
      Bucket: config.storage.s3Bucket,
      Key: storageKey,
    });
    return getSignedUrl(s3(), cmd, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  }

  // Local: return a signed-style path (the controller will serve the file directly)
  return `/api/v1/documents/_local/${encodeURIComponent(storageKey)}`;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (!stream) {
    return Buffer.alloc(0);
  }

  if (typeof (stream as any).transformToByteArray === 'function') {
    return Buffer.from(await (stream as any).transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function downloadFile(storageKey: string): Promise<Buffer> {
  if (config.storage.driver === 's3') {
    const response = await s3().send(
      new GetObjectCommand({
        Bucket: config.storage.s3Bucket,
        Key: storageKey,
      })
    );
    return await streamToBuffer(response.Body);
  }

  const filePath = path.join(config.storage.localUploadDir, storageKey);
  return fs.readFileSync(filePath);
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteFile(storageKey: string): Promise<void> {
  if (config.storage.driver === 's3') {
    await s3().send(
      new DeleteObjectCommand({
        Bucket: config.storage.s3Bucket,
        Key: storageKey,
      })
    );
  } else {
    const filePath = path.join(config.storage.localUploadDir, storageKey);
    fs.rmSync(filePath, { force: true });
  }
}
