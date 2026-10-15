import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createEntitiesAccessibleHandler } from './entitiesAccessible.js';
import { resolveConnectFinanceReadIdentity } from './connectReadContext.js';

type Delegate = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
/** Minimal selector over the existing canonical domain selector; no tax IDs, amounts or documents. */
export function createConnectEntitiesHandler(delegate: Delegate = createEntitiesAccessibleHandler(resolveConnectFinanceReadIdentity)) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const token = req.headers['x-connect-user-authorization'] ?? req.headers.authorization;
    if (typeof token !== 'string' || token.length > 8192 || !/^Bearer\s+\S+$/i.test(token)) return res.status(401).json({ error: 'FINANCE_CONTEXT_UNAVAILABLE' });
    let status = 200;
    const projection = {
      setHeader() { return projection; },
      status(code: number) { status = code; return projection; },
      json(data: any) {
        if (status !== 200) return res.status(status).json({ error: 'FINANCE_CONTEXT_UNAVAILABLE' });
        if (!Array.isArray(data?.entities) || data.entities.length > 200 || data.entities.some((item: any) => !item || typeof item.id !== 'string' || !item.id || item.id.length > 180 || /[\\/\u0000-\u001f]/.test(item.id) || typeof item.displayName !== 'string' || item.displayName.length > 120)) return res.status(503).json({ error: 'FINANCE_SELECTOR_UNAVAILABLE' });
        return res.json({ schemaVersion: 1, organizationId: data.organizationId, entities: data.entities.slice(0, 25).map((item: any) => ({ id: item.id, displayName: item.displayName.replace(/[\u0000-\u001f]/g, '') })), limited: data.candidateLimitReached === true || data.entities.length > 25 });
      },
    } as unknown as VercelResponse;
    try { return await delegate({ ...req, headers: { ...req.headers, authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}` } } as VercelRequest, projection); }
    catch { return res.status(503).json({ error: 'FINANCE_SELECTOR_UNAVAILABLE' }); }
  };
}
export default createConnectEntitiesHandler();
