import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { UNIVERSAL_EVIDENCE_MAX_BYTES } from '../../../shared/finance/universalEvidence.js';

export type EvidenceStoredObject = { path: string; contentType: string; size: number; sha256: string; headerBytes: Uint8Array };
export interface UniversalEvidenceStorageAdapter {
  createUploadUrl(path: string, contentType: string, ttlMs: number): Promise<{ url: string; requiredHeaders: Record<string, string> }>;
  inspectAndHash(path: string): Promise<EvidenceStoredObject>;
}
const SYMBOL = Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE');

export function getUniversalEvidenceStorageAdapter(): UniversalEvidenceStorageAdapter {
  if (process.env.NODE_ENV === 'test' && (globalThis as any)[SYMBOL]) return (globalThis as any)[SYMBOL];
  getFirebaseAdmin();
  const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'millionsnest.firebasestorage.app');
  return {
    async createUploadUrl(path, contentType, ttlMs) {
      const requiredHeaders = { 'x-goog-if-generation-match': '0' };
      const [url] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + ttlMs, contentType, extensionHeaders: requiredHeaders });
      return { url, requiredHeaders };
    },
    async inspectAndHash(path) {
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size || 0);
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error('EVIDENCE_UPLOAD_MISSING');
      if (size > UNIVERSAL_EVIDENCE_MAX_BYTES) throw new Error('EVIDENCE_TOO_LARGE');
      const hash = createHash('sha256');
      const header: Buffer[] = [];
      let headerLength = 0;
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on('data', (chunk: Buffer) => {
          hash.update(chunk);
          if (headerLength < 65536) {
            const part = chunk.subarray(0, 65536 - headerLength);
            header.push(part);
            headerLength += part.length;
          }
        });
        stream.on('error', reject);
        stream.on('end', resolve);
      });
      return { path, contentType: String(metadata.contentType || ''), size, sha256: hash.digest('hex'), headerBytes: Buffer.concat(header) };
    },
  };
}
