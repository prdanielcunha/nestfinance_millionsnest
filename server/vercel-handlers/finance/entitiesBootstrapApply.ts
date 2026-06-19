import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  let admin;
  try {
    admin = getFirebaseAdmin();
  } catch (err: any) {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const { auth, firestore } = admin;

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);
    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted || sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const { financeEntityId, templateId, legacyAssignment, selection, previewDigest, idempotencyKey } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string' || !templateId || !selection || !previewDigest || !idempotencyKey) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const isApplyEnabled = process.env.NESTFINANCE_BOOTSTRAP_APPLY_ENABLED === 'true';
    if (!isApplyEnabled) {
      return res.status(503).json({ code: 'BOOTSTRAP_APPLY_DISABLED', error: 'Apply endpoint is currently disabled' });
    }

    // Freeze details for next phase
    // - novos locks usarão somente SHA-256;
    // - todos os itens adotados também receberão novos locks escopados por financeEntityId;
    // - locks históricos permanecerão intactos;
    // - novos locks serão criados com transaction dot create();
    // - IDs novos serão preparados antes do callback transacional;
    // - mesmos dados legados manterão seus IDs;
    // - idempotência terá uma coleção server-only explícita;
    // - mesma chave com payload diferente resultará em conflito;
    // - 200 changed:false não será usado para solicitação inicial vazia.

    return res.status(501).json({ error: 'NOT_IMPLEMENTED' });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities bootstrap apply error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
