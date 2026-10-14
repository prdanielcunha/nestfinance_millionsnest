import type { VercelRequest, VercelResponse } from '@vercel/node';
import evidenceList from './universalEvidenceList.js';

type EvidenceHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
/** Uses the existing finance.view/entity-scoped API; no Connect-specific authorization or business rules. */
export function createConnectPendingDocumentsHandler(delegate: EvidenceHandler = evidenceList) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'financeEntityId') ||
        typeof body.financeEntityId !== 'string' || !body.financeEntityId.trim() || body.financeEntityId.length > 180 || /[\\/\u0000-\u001f]/.test(body.financeEntityId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    // Hosting/Cloud Run may consume Authorization for transport identity. This
    // alternate header still contains an untrusted Firebase token, not authority:
    // the unchanged canonical delegate verifies revocation, Hub, RBAC and entity.
    const forwarded = req.headers['x-connect-user-authorization'];
    if (forwarded !== undefined && (typeof forwarded !== 'string' || forwarded.length > 8192 || !/^Bearer\s+\S+$/i.test(forwarded))) {
      return res.status(401).json({ error: 'FINANCE_CONTEXT_UNAVAILABLE' });
    }
    const scopedRequest = { ...req, headers: forwarded === undefined ? req.headers : { ...req.headers, authorization: `Bearer ${String(forwarded).replace(/^Bearer\s+/i, '')}` }, body: { financeEntityId: body.financeEntityId, pageSize: 1 } } as VercelRequest;
    let status = 200;
    const projection = {
      status(code: number) { status = code; return projection; },
      json(data: any) {
        if (status !== 200) return res.status(status).json({ error: 'FINANCE_CONTEXT_UNAVAILABLE' });
        const keys = ['awaitingUpload', 'needsClassification', 'pendingReview'] as const;
        if (!data?.summary || keys.some(key => !Number.isSafeInteger(data.summary[key]) || data.summary[key] < 0)) {
          return res.status(503).json({ error: 'FINANCE_SUMMARY_UNAVAILABLE' });
        }
        return res.status(200).json({ schemaVersion: 1, summary: Object.fromEntries(keys.map(key => [key, data.summary[key]])) });
      },
    } as unknown as VercelResponse;
    try { return await delegate(scopedRequest, projection); }
    catch { return res.status(503).json({ error: 'FINANCE_SUMMARY_UNAVAILABLE' }); }
  };
}
export default createConnectPendingDocumentsHandler();
