import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

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

    // Hardening: Do not accept forbidden metadata properties as authority from client
    const forbiddenKeys = [
      'type', 'nature', 'configurationStatus', 'templateKey', 'canonicalCode'
    ];
    for (const key of forbiddenKeys) {
      if (req.body[key] !== undefined) {
        return res.status(400).json({ 
          error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES', 
          message: `O campo ${key} não é aceito diretamente como autoridade.` 
        });
      }
    }

    const { accountId, purposeCode, requestId, idempotencyKey, advancedConfiguration } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID', message: 'O ID da conta é obrigatório.' });
    }

    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_REQUEST_ID', message: 'O requestId é inválido.' });
    }

    if (!isValidIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY', message: 'A chave de idempotência é inválida.' });
    }

    const allowedPurposeCodes = [
      'physical_cash', 'petty_cash', 'bank_account', 'digital_payment_account',
      'church_credit_card', 'reimbursement_payable', 'card_receivable',
      'other_asset', 'other_liability', 'other_receivable', 'temporary_clearing'
    ];

    if (!purposeCode || !allowedPurposeCodes.includes(purposeCode)) {
      return res.status(400).json({ error: 'INVALID_PURPOSE_CODE', message: 'Código de propósito inválido ou não fornecido.' });
    }

    // Resolve session & capabilities
    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted) {
      return res.status(403).json({ error: 'FINANCE_ACCOUNT_CONFIGURE_FORBIDDEN', message: 'Acesso negado.' });
    }

    const hasManageAccess = sessionList.isGlobalAccess || 
                            sessionList.capabilities?.includes('finance.accounts.repair') || 
                            sessionList.capabilities?.includes('finance.accounts.manage');

    if (!hasManageAccess) {
      return res.status(403).json({ error: 'FINANCE_ACCOUNT_CONFIGURE_FORBIDDEN', message: 'Você não tem permissão para configurar contas.' });
    }

    // Limit who can configure temporary_clearing
    if (purposeCode === 'temporary_clearing' && !sessionList.isGlobalAccess) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Apenas administradores globais podem configurar contas de compensação temporária.' });
    }

    // Load account first to verify existence and get financeEntityId
    const orgRef = firestore.collection('organizations').doc(organizationId);
    const accountsRef = orgRef.collection('financeAccounts');
    const accountRef = accountsRef.doc(accountId);
    const accountSnap = await accountRef.get();

    if (!accountSnap.exists) {
      return res.status(404).json({ error: 'FINANCE_ACCOUNT_NOT_FOUND', message: 'A conta informada não foi encontrada.' });
    }

    const accountData = accountSnap.data()!;
    const financeEntityId = accountData.financeEntityId;

    if (!financeEntityId) {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED', message: 'Entidade financeira da conta não identificada.' });
    }

    // Advanced Configuration Validation
    if (advancedConfiguration) {
      if (advancedConfiguration.natureCode && !['asset', 'liability', 'receivable', 'clearing'].includes(advancedConfiguration.natureCode)) {
        return res.status(400).json({ error: 'INVALID_NATURE_CODE', message: 'Natureza contábil inválida no bloco avançado.' });
      }
      if (advancedConfiguration.availabilityBehavior && !['immediate', 'delayed', 'restricted', 'clearing'].includes(advancedConfiguration.availabilityBehavior)) {
        return res.status(400).json({ error: 'INVALID_AVAILABILITY_BEHAVIOR', message: 'Comportamento de disponibilidade inválido.' });
      }
      if (advancedConfiguration.supportedInstrumentCodes) {
        if (!Array.isArray(advancedConfiguration.supportedInstrumentCodes)) {
          return res.status(400).json({ error: 'INVALID_INSTRUMENTS', message: 'Meios de pagamento devem ser fornecidos como array.' });
        }
        for (const inst of advancedConfiguration.supportedInstrumentCodes) {
          if (!['pix', 'cash', 'transfer', 'slip', 'card'].includes(inst)) {
            return res.status(400).json({ error: 'INVALID_INSTRUMENT_CODE', message: `Meio de pagamento inválido: ${inst}` });
          }
        }
      }
    }

    // Mapping server-side
    const finalType = (purposeCode === 'physical_cash') ? 'cash' :
                      (purposeCode === 'petty_cash') ? 'petty_cash' :
                      (purposeCode === 'bank_account') ? 'bank_checking' :
                      (purposeCode === 'digital_payment_account') ? 'payment_account' :
                      (purposeCode === 'church_credit_card') ? 'credit_card' :
                      (purposeCode === 'reimbursement_payable') ? 'reimbursement_payable' :
                      (purposeCode === 'card_receivable') ? 'card_receivable' : 'other';

    let finalNature = (purposeCode === 'physical_cash' || purposeCode === 'petty_cash' || purposeCode === 'bank_account' || purposeCode === 'digital_payment_account' || purposeCode === 'other_asset') ? 'asset' :
                      (purposeCode === 'church_credit_card' || purposeCode === 'reimbursement_payable' || purposeCode === 'other_liability') ? 'liability' :
                      (purposeCode === 'card_receivable' || purposeCode === 'other_receivable') ? 'receivable' : 'clearing';

    if (advancedConfiguration?.natureCode) {
      finalNature = advancedConfiguration.natureCode;
    }

    // Validate invalid combinations
    if (purposeCode === 'physical_cash' && finalNature === 'liability') {
      return res.status(400).json({ error: 'INVALID_COMBINATION', message: 'Associação contábil inválida: physical_cash não pode ser liability.' });
    }
    if (purposeCode === 'church_credit_card' && finalNature === 'asset') {
      return res.status(400).json({ error: 'INVALID_COMBINATION', message: 'Associação contábil inválida: church_credit_card não pode ser asset.' });
    }
    if (purposeCode === 'reimbursement_payable' && finalNature === 'receivable') {
      return res.status(400).json({ error: 'INVALID_COMBINATION', message: 'Associação contábil inválida: reimbursement_payable não pode ser receivable.' });
    }

    // Required explanation for temporary clearing
    if (purposeCode === 'temporary_clearing') {
      const explanation = advancedConfiguration?.explanation || req.body.explanation;
      if (!explanation || typeof explanation !== 'string' || explanation.trim().length < 10) {
        return res.status(400).json({ error: 'EXPLANATION_REQUIRED', message: 'É necessária uma explicação de no mínimo 10 caracteres para compensação temporária.' });
      }
    }

    const finalStatus = (purposeCode === 'temporary_clearing') ? 'pending_rules' : 'complete';

    const auditRef = orgRef.collection('financeAuditLogs');
    const idempotencyRef = orgRef.collection('financeIdempotency');

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'accounts_configure_custom', idempotencyKey);
    const payloadHash = hashPayload({ accountId, purposeCode, advancedConfiguration });

    try {
      const result = await executeWithIdempotency(firestore, idempotencyRef, keyHash, payloadHash, async (transaction) => {
        const freshSnap = (await transaction.get(accountRef)) as any;
        if (!freshSnap.exists) {
          throw new Error('FINANCE_ACCOUNT_NOT_FOUND');
        }
        const freshData = freshSnap.data()!;
        if (freshData.financeEntityId !== financeEntityId) {
          throw new Error('FINANCE_ACCOUNT_CROSS_ENTITY');
        }

        const currentType = freshData.type;
        const currentNature = freshData.nature;
        const currentStatus = freshData.configurationStatus;

        const needsType = currentType !== finalType;
        const needsNature = currentNature !== finalNature;
        const needsStatus = currentStatus !== finalStatus;

        // Build supported instruments
        const instCodes = advancedConfiguration?.supportedInstrumentCodes || ['pix', 'cash', 'transfer', 'slip', 'card'];

        const updates: any = {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
          configurationStatus: finalStatus,
          type: finalType,
          nature: finalNature,
          purposeCode,
          supportedPaymentInstruments: instCodes
        };

        if (purposeCode === 'temporary_clearing') {
          updates.temporaryClearingExplanation = advancedConfiguration?.explanation || req.body.explanation;
        }

        transaction.update(accountRef, updates);

        // Build audit log
        const auditDocRef = auditRef.doc();
        transaction.create(auditDocRef, {
          id: auditDocRef.id,
          organizationId,
          financeEntityId,
          accountId,
          action: 'account_configure_custom',
          reason: 'custom_configuration',
          purposeCode,
          oldState: { 
            type: currentType || null, 
            nature: currentNature || null, 
            configurationStatus: currentStatus || null 
          },
          newState: { 
            type: finalType, 
            nature: finalNature, 
            configurationStatus: finalStatus 
          },
          performedBy: uid,
          requestId,
          createdAt: FieldValue.serverTimestamp()
        });

        return {
          accountId,
          status: 'configured',
          configured: true,
          account: {
            id: accountId,
            name: freshData.name,
            type: finalType,
            nature: finalNature,
            configurationStatus: finalStatus,
            supportedPaymentInstruments: instCodes
          }
        };
      });

      return res.status(200).json({ success: true, results: [result] });
    } catch (txError: any) {
      const msg = txError.message || '';
      if (msg.includes('FINANCE_IDEMPOTENCY_CONFLICT: Payload mismatch')) {
        return res.status(409).json({ 
          error: 'FINANCE_ACCOUNT_CONFIGURE_CONFLICT', 
          message: 'Chave de idempotência já utilizada com um payload diferente.',
          requestId 
        });
      }
      if (msg.includes('FINANCE_IDEMPOTENCY_CONFLICT: In progress')) {
        return res.status(409).json({ 
          error: 'FINANCE_ACCOUNT_CONFIGURE_CONFLICT', 
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
      throw txError;
    }
  } catch (error: any) {
    console.error('[accountsConfigureCustom] Error:', error);
    return res.status(500).json({ 
      error: 'FINANCE_ACCOUNT_CONFIGURE_FAILED', 
      message: 'Erro interno ao tentar configurar a conta.',
      requestId: req.body?.requestId 
    });
  }
}
