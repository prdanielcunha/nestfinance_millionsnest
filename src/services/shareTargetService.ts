const CACHE_NAME = 'nestfinance-share-target-v1';
const PREFIX = '/__nestfinance_share_target__';

export type SharedTargetPayload = {
  files: File[];
  text: string;
};

export async function consumeShareTarget(id: string): Promise<SharedTargetPayload | null> {
  if (
    typeof window === 'undefined' ||
    !('caches' in window) ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(id)
  ) return null;

  const cache = await caches.open(CACHE_NAME);
  const base = new URL(`${PREFIX}/${id}`, window.location.origin).toString();
  const metaResponse = await cache.match(`${base}/meta`);
  if (!metaResponse) return null;

  try {
    const meta = await metaResponse.json() as {
      title?: string;
      text?: string;
      url?: string;
      files?: Array<{ index: number; name: string; type: string }>;
    };
    const files: File[] = [];
    for (const descriptor of meta.files || []) {
      const response = await cache.match(`${base}/file/${descriptor.index}`);
      if (!response) continue;
      const blob = await response.blob();
      files.push(new File([blob], descriptor.name || `shared-${descriptor.index}`, {
        type: descriptor.type || blob.type,
      }));
      await cache.delete(`${base}/file/${descriptor.index}`);
    }
    await cache.delete(`${base}/meta`);
    const text = [meta.title, meta.text, meta.url].filter(Boolean).join('\n').trim();
    return { files, text };
  } catch {
    await cache.delete(`${base}/meta`);
    return null;
  }
}
