import type { UniversalEvidenceSourceKind } from '../../shared/finance/universalEvidence.js';
import type { UniversalEvidenceDocumentType } from '../../shared/finance/universalEvidenceReview.js';

const CACHE_NAME = 'nestfinance-universal-capture-offline-v1';
const PREFIX = '/__nestfinance_offline_capture__';

export type OfflineCaptureRecord = {
  id: string;
  file: File;
  sourceKind: UniversalEvidenceSourceKind;
  intent: UniversalEvidenceDocumentType;
  keys: { start: string; finalize: string; classify: string; analyze: string };
  savedAt: number;
};

function available() {
  return typeof window !== 'undefined' && 'caches' in window;
}

function baseUrl(organizationId: string, financeEntityId: string, id: string) {
  return new URL(
    `${PREFIX}/${encodeURIComponent(organizationId)}/${encodeURIComponent(financeEntityId)}/${encodeURIComponent(id)}`,
    window.location.origin,
  ).toString();
}

export const universalCaptureOfflineQueue = {
  async put(
    organizationId: string,
    financeEntityId: string,
    record: OfflineCaptureRecord,
  ) {
    if (!available()) return;
    const cache = await caches.open(CACHE_NAME);
    const base = baseUrl(organizationId, financeEntityId, record.id);
    const metadata = {
      id: record.id,
      name: record.file.name,
      type: record.file.type,
      lastModified: record.file.lastModified,
      sourceKind: record.sourceKind,
      intent: record.intent,
      keys: record.keys,
      savedAt: record.savedAt,
    };
    await cache.put(`${base}/meta`, new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await cache.put(`${base}/file`, new Response(record.file, {
      headers: { 'Content-Type': record.file.type || 'application/octet-stream' },
    }));
  },

  async remove(organizationId: string, financeEntityId: string, id: string) {
    if (!available()) return;
    const cache = await caches.open(CACHE_NAME);
    const base = baseUrl(organizationId, financeEntityId, id);
    await Promise.all([cache.delete(`${base}/meta`), cache.delete(`${base}/file`)]);
  },

  async list(organizationId: string, financeEntityId: string): Promise<OfflineCaptureRecord[]> {
    if (!available()) return [];
    const cache = await caches.open(CACHE_NAME);
    const scope = baseUrl(organizationId, financeEntityId, '');
    const keys = await cache.keys();
    const metaRequests = keys.filter(
      (request) => request.url.startsWith(scope) && request.url.endsWith('/meta'),
    );

    const records: OfflineCaptureRecord[] = [];
    for (const request of metaRequests) {
      try {
        const metaResponse = await cache.match(request);
        if (!metaResponse) continue;
        const meta = await metaResponse.json();
        const base = request.url.slice(0, -'/meta'.length);
        const fileResponse = await cache.match(`${base}/file`);
        if (!fileResponse) continue;
        const blob = await fileResponse.blob();
        records.push({
          id: String(meta.id),
          file: new File([blob], String(meta.name || 'offline-file'), {
            type: String(meta.type || blob.type || 'application/octet-stream'),
            lastModified: Number(meta.lastModified || Date.now()),
          }),
          sourceKind: meta.sourceKind as UniversalEvidenceSourceKind,
          intent: meta.intent as UniversalEvidenceDocumentType,
          keys: meta.keys,
          savedAt: Number(meta.savedAt || 0),
        });
      } catch {
        // One malformed cache entry must not block the remaining offline queue.
      }
    }
    return records.sort((a, b) => a.savedAt - b.savedAt);
  },
};
