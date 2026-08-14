import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  isCountPaperLocale,
  isCountPaperStage,
} from '../../../shared/finance/countPaper.js';
import {
  buildCountPaperIdentity,
  generateCountPaperAuditId,
  generateCountPaperFormId,
} from './countPaperHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      countSessionId,
      stage,
      locale,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      typeof countSessionId !== 'string' ||
      !/^cnt_[a-f0-9]{24}$/.test(countSessionId) ||
      !isCountPaperStage(stage) ||
      !isCountPaperLocale(locale) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(
      req,
      'finance.create_drafts',
    );
    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);
    const sessionRef = entityRef.collection('countSessions').doc(countSessionId);
    const formsRef = entityRef.collection('countPaperForms');

    const payloadHash = hashPayload({
      countSessionId,
      stage,
      locale,
      templateVersion: COUNT_PAPER_TEMPLATE_VERSION,
    });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      `count_paper_form_generate_${stage}`,
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = sessionDoc.data() || {};
        if (
          session.organizationId !== organizationId ||
          session.financeEntityId !== financeEntityId
        ) {
          throw new Error('COUNT_ENTITY_MISMATCH');
        }

        if (stage === 'count_a' && session.status !== 'counting_a') {
          throw new Error('COUNT_PAPER_INVALID_STATE');
        }
        if (stage === 'count_b') {
          const firstEntries = Array.isArray(session.countA?.entries) ? session.countA.entries : [];
          if (!['counting_a', 'counting_b'].includes(session.status) || firstEntries.length === 0) {
            throw new Error('COUNT_PAPER_SECOND_COUNT_NOT_READY');
          }
        }

        const formId = generateCountPaperFormId();
        const identity = buildCountPaperIdentity({
          organizationId,
          financeEntityId,
          countSessionId,
          formId,
          stage,
          locale,
        });
        const auditId = generateCountPaperAuditId();

        transaction.set(formsRef.doc(formId), {
          id: formId,
          organizationId,
          financeEntityId,
          countSessionId,
          serviceLabel: String(session.serviceLabel || ''),
          serviceDate: String(session.serviceDate || ''),
          stage,
          locale,
          templateVersion: identity.templateVersion,
          checksum: identity.checksum,
          qrPayload: identity.qrPayload,
          status: 'issued',
          createdByUid: uid,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        });

        transaction.set(context.repository.getAuditRef().doc(auditId), {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_paper_form',
          resourceId: formId,
          action: 'count.paper_form_issued',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            countSessionId,
            stage,
            locale,
            templateVersion: identity.templateVersion,
            financialMaterialEmbedded: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          formId,
          stage,
          templateVersion: identity.templateVersion,
          checksum: identity.checksum,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Paper Form Generate Error:', error);
    const message = String(error?.message || '');
    if (message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'COUNT_ENTITY_MISMATCH') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message.startsWith('COUNT_PAPER_') || message.startsWith('COUNT_')) {
      return res.status(400).json({ error: message });
    }
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
