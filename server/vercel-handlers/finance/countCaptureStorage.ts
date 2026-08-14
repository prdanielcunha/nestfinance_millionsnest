import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';

export type CountCaptureStoredObject = {
  path: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type CountCaptureUploadGrant = {
  url: string;
  requiredHeaders: Record<string, string>;
};

export interface CountCaptureStorageAdapter {
  createUploadUrl(path: string, contentType: string, ttlMs: number): Promise<CountCaptureUploadGrant>;
  createReadUrl(path: string, ttlMs: number): Promise<string>;
  inspectAndHash(path: string): Promise<CountCaptureStoredObject>;
}

const TEST_STORAGE_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_STORAGE');

function productionAdapter(): CountCaptureStorageAdapter {
  // Ensure the canonical Admin app/credentials are initialized before asking
  // firebase-admin/storage for the project bucket.
  getFirebaseAdmin();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'millionsnest.firebasestorage.app';
  const bucket = getStorage().bucket(bucketName);

  return {
    async createUploadUrl(path, contentType, ttlMs) {
      const requiredHeaders = { 'x-goog-if-generation-match': '0' };
      const [url] = await bucket.file(path).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + ttlMs,
        contentType,
        extensionHeaders: requiredHeaders,
      });
      return { url, requiredHeaders };
    },

    async createReadUrl(path, ttlMs) {
      const [url] = await bucket.file(path).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + ttlMs,
      });
      return url;
    },

    async inspectAndHash(path) {
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType || '');
      const size = Number(metadata.size || 0);
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error('COUNT_CAPTURE_UPLOAD_MISSING');

      const hash = createHash('sha256');
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
      });

      return {
        path,
        contentType,
        size,
        sha256: hash.digest('hex'),
      };
    },
  };
}

export function getCountCaptureStorageAdapter(): CountCaptureStorageAdapter {
  if (process.env.NODE_ENV === 'test') {
    const injected = (globalThis as any)[TEST_STORAGE_SYMBOL];
    if (injected) return injected as CountCaptureStorageAdapter;
  }
  return productionAdapter();
}
