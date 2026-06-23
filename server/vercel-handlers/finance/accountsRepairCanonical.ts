import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';
import { FieldValue } from 'firebase-admin/firestore';
import { CANONICAL_ACCOUNT_TEMPLATES } from '../../../shared/finance/smartLogic.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  // Validate content type
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
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
    const organizationId = decodedToken.mn_organization_id || req.headers['x-organization-id'] as string;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    // Hardening: Do not accept forbidden metadata properties from client
    const forbiddenKeys = [
      'type', 'nature', 'configurationStatus', 'templateKey', 
      'recommendedType', 'recommendedNature', 'supportedPaymentInstruments'
    ];
    for (const key of forbiddenKeys) {
      if (req.body[key] !== undefined) {
        return res.status(400).json({ 
          error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES', 
          message: `O campo ${key} não é aceito diretamente do cliente.` 
        });
      }
    }

    const { accountId, financeEntityId, requestId, idempotencyKey } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID', message: 'O ID da conta é obrigatório.' });
    }

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED', message: 'O ID da entidade financeira é obrigatório.' });
    }

    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_REQUEST_ID', message: 'O requestId é inválido.' });
    }

    if (!isValidIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY', message: 'A chave de idempotência é inválida.' });
    }

    // Resolve session & capabilities
    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted) {
      return res.status(403).json({ error: 'FINANCE_ACCOUNT_REPAIR_FORBIDDEN', message: 'Acesso negado.' });
    }

    // Permission Hardening:
    // User must have finance.accounts.repair or finance.accounts.manage (or global access)
    // A user with create draft but without repair/manage permissions CANNOT repair.
    const hasRepairAccess = sessionList.isGlobalAccess || 
                            sessionList.capabilities?.includes('finance.accounts.repair') || 
                            sessionList.capabilities?.includes('finance.accounts.manage');

    if (!hasRepairAccess) {
      return res.status(403).json({ error: 'FINANCE_ACCOUNT_REPAIR_FORBIDDEN', message: 'Você não tem permissão para reparar contas.' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const accountsRef = orgRef.collection('financeAccounts');
    const auditRef = orgRef.collection('financeAuditLogs');
    const idempotencyRef = orgRef.collection('financeIdempotency');

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'accounts_repair_canonical', idempotencyKey);
    const payloadHash = hashPayload({ accountId, financeEntityId });

    try {
      const result = await executeWithIdempotency(firestore, idempotencyRef, keyHash, payloadHash, async (transaction) => {
        const accountRef = accountsRef.doc(accountId);
        const accountSnap = (await transaction.get(accountRef)) as any;

        if (!accountSnap.exists) {
          throw new Error('FINANCE_ACCOUNT_NOT_FOUND');
        }

        const accountData = accountSnap.data()!;

        // Cross-entity check: enforce isolation
        if (accountData.financeEntityId !== financeEntityId) {
          throw new Error('FINANCE_ACCOUNT_CROSS_ENTITY');
        }

        const templateKey = accountData.templateKey;
        if (!templateKey) {
          throw new Error('FINANCE_ACCOUNT_NOT_REPAIRABLE');
        }

        const canon = CANONICAL_ACCOUNT_TEMPLATES[templateKey];
        if (!canon) {
          throw new Error('FINANCE_ACCOUNT_NOT_REPAIRABLE');
        }

        const currentType = accountData.type;
        const currentNature = accountData.nature;
        const currentStatus = accountData.configurationStatus;

        const expectedType = canon.type;
        const expectedNature = canon.nature;

        const needsType = !currentType || currentType !== expectedType;
        const needsNature = !currentNature || currentNature !== expectedNature;
        const needsStatus = currentStatus !== 'complete';

        if (needsType || needsNature || needsStatus) {
          const updates: any = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
            configurationStatus: 'complete'
          };

          if (needsType) updates.type = expectedType;
          if (needsNature) updates.nature = expectedNature;

          transaction.update(accountRef, updates);

          // Build audit log with strict required properties
          const auditDocRef = auditRef.doc();
          transaction.create(auditDocRef, {
            id: auditDocRef.id,
            organizationId,
            financeEntityId,
            accountId,
            action: 'account_repair_canonical',
            reason: 'canonical_repair',
            templateKey,
            oldState: { 
              type: currentType || null, 
              nature: currentNature || null, 
              configurationStatus: currentStatus || null 
            },
            newState: { 
              type: expectedType, 
              nature: expectedNature, 
              configurationStatus: 'complete' 
            },
            performedBy: uid,
            requestId,
            createdAt: FieldValue.serverTimestamp()
          });

          return { 
            accountId, 
            status: 'repaired', 
            repaired: true,
            account: {
              id: accountId,
              name: accountData.name,
              type: expectedType,
              nature: expectedNature,
              configurationStatus: 'complete'
            }
          };
        } else {
          return { 
            accountId, 
            status: 'already_complete', 
            repaired: false,
            account: {
              id: accountId,
              name: accountData.name,
              type: currentType,
              nature: currentNature,
              configurationStatus: 'complete'
            }
          };
        }
      });

      return res.status(200).json({ success: true, results: [result] });
    } catch (txError: any) {
      const msg = txError.message || '';
      
      if (msg.includes('FINANCE_IDEMPOTENCY_CONFLICT: Payload mismatch')) {
        return res.status(409).json({ 
          error: 'FINANCE_ACCOUNT_REPAIR_CONFLICT', 
          message: 'Chave de idempotência já utilizada com um payload diferente.',
          requestId 
        });
      }
      if (msg.includes('FINANCE_IDEMPOTENCY_CONFLICT: In progress')) {
        return res.status(409).json({ 
          error: 'FINANCE_ACCOUNT_REPAIR_CONFLICT', 
          message: 'Uma requisição com esta chave de idempotência já está em progresso.',
          requestId 
        });
      }

      if (msg === 'FINANCE_ACCOUNT_NOT_FOUND') {
        return res.status(404).json({ error: 'FINANCE_ACCOUNT_NOT_FOUND', message: 'A conta informada não foi encontrada.', requestId });
      }
      if (msg === 'FINANCE_ACCOUNT_CROSS_ENTITY') {
        return res.status(403).json({ error: 'FINANCE_ACCOUNT_CROSS_ENTITY', message: 'A conta pertence a outra entidade financeira.', requestId });
      }
      if (msg === 'FINANCE_ACCOUNT_NOT_REPAIRABLE') {
        return res.status(400).json({ error: 'FINANCE_ACCOUNT_NOT_REPAIRABLE', message: 'Esta conta não possui identidade canônica e não pode ser reparada automaticamente.', requestId });
      }

      throw txError;
    }
  } catch (error: any) {
    console.error('[accountsRepairCanonical] Error:', error);
    return res.status(500).json({ 
      error: 'FINANCE_ACCOUNT_REPAIR_FAILED', 
      message: 'Erro interno ao tentar reparar a conta.',
      requestId: req.body?.requestId 
    });
  }
}
