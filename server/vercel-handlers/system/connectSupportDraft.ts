import type { VercelRequest, VercelResponse } from '@vercel/node';

const ENDPOINT = 'https://connect.millionsnest.com/api/core/support/draft';

/** Identity relay only. Connect resolves fresh Hub authority and the official number. */
export function createConnectSupportDraftHandler(fetchImpl: typeof fetch = fetch) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const token = req.headers['x-connect-user-authorization'] ?? req.headers.authorization;
    if (typeof token !== 'string' || token.length > 8192 || !/^Bearer\s+\S+$/i.test(token)) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const org = req.headers['x-organization-id'];
    if (typeof org !== 'string' || !org.trim() || org.length > 180 || /[\\/\u0000-\u001f]/.test(org) ||
        !req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(k => k !== 'locale') ||
        !['pt-BR', 'en-US', 'es-ES'].includes(req.body.locale)) return res.status(400).json({ error: 'INVALID_SUPPORT_SCOPE' });
    try {
      const response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: token, 'X-Connect-User-Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'nestfinance', organizationId: org, locale: req.body.locale }) });
      if (!response.ok) return res.status([401, 403, 404, 409].includes(response.status) ? response.status : 503).json({ error: 'SUPPORT_UNAVAILABLE' });
      const data = await response.json(), url = new URL(data.draftUrl);
      if (data.product !== 'nestfinance' || data.automaticSend !== false || !Number.isSafeInteger(data.expiresAt) ||
          data.expiresAt <= Date.now() || data.expiresAt > Date.now() + 630000 || url.origin !== 'https://wa.me' ||
          url.username || url.password || url.hash || !/^\/[1-9][0-9]{7,14}$/.test(url.pathname) ||
          [...url.searchParams.keys()].length !== 1 || !url.searchParams.get('text') || url.searchParams.get('text')!.length > 2048 ||
          url.searchParams.get('text')!.includes(token.replace(/^Bearer\s+/i, ''))) throw new Error();
      return res.status(200).json({ product: 'nestfinance', automaticSend: false, expiresAt: data.expiresAt, draftUrl: url.toString() });
    } catch { return res.status(503).json({ error: 'SUPPORT_UNAVAILABLE' }); }
  };
}

export default createConnectSupportDraftHandler();
