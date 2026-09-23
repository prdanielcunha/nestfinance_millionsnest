const CACHE_NAME = 'nestfinance-share-target-v1';
const PREFIX = '/__nestfinance_share_target__';
const ACTION = '/finance/capture/share-target';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== ACTION) return;

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const id = self.crypto.randomUUID().replaceAll('-', '');
      const cache = await caches.open(CACHE_NAME);
      const base = new URL(`${PREFIX}/${id}`, self.location.origin).toString();
      const descriptors = [];
      const sharedFiles = [
        ...formData.getAll('files'),
        ...formData.getAll('file'),
      ].filter((value) => value instanceof File);

      for (let index = 0; index < sharedFiles.length; index += 1) {
        const file = sharedFiles[index];
        descriptors.push({
          index,
          name: file.name || `shared-${index + 1}`,
          type: file.type || 'application/octet-stream',
        });
        await cache.put(`${base}/file/${index}`, new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        }));
      }

      await cache.put(`${base}/meta`, new Response(JSON.stringify({
        title: String(formData.get('title') || ''),
        text: String(formData.get('text') || ''),
        url: String(formData.get('url') || ''),
        files: descriptors,
        createdAt: Date.now(),
      }), { headers: { 'Content-Type': 'application/json' } }));

      return Response.redirect(`/finance/capture?shareTarget=${id}`, 303);
    } catch {
      return Response.redirect('/finance/capture?shareTargetError=1', 303);
    }
  })());
});
