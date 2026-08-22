import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  buildCountPaperQrPayload,
  isCountPaperLocale,
  isCountPaperStage,
  isValidCountPaperChecksum,
  isValidCountPaperFormId,
} from '../../../shared/finance/countPaper.js';
import { computeCountPaperChecksum, toOptionalIso } from './countPaperHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, formId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountPaperFormId(formId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.view');
    const formRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countPaperForms')
      .doc(formId);
    const formDoc = await formRef.get();
    if (!formDoc.exists) return res.status(404).json({ error: 'COUNT_PAPER_FORM_NOT_FOUND' });

    const data = formDoc.data() || {};
    if (
      data.organizationId !== organizationId ||
      data.financeEntityId !== financeEntityId ||
      typeof data.countSessionId !== 'string' ||
      !/^cnt_[a-f0-9]{24}$/.test(data.countSessionId) ||
      !isCountPaperStage(data.stage) ||
      !isCountPaperLocale(data.locale) ||
      !isValidCountPaperChecksum(data.checksum) ||
      data.templateVersion !== COUNT_PAPER_TEMPLATE_VERSION
    ) {
      console.error('Count Paper Form integrity mismatch', { formId });
      return res.status(500).json({ error: 'COUNT_PAPER_INTEGRITY_ERROR' });
    }

    const expectedChecksum = computeCountPaperChecksum({
      organizationId,
      financeEntityId,
      countSessionId: data.countSessionId,
      formId,
      stage: data.stage,
      locale: data.locale,
    });
    const expectedPayload = buildCountPaperQrPayload({
      formId,
      templateVersion: data.templateVersion,
      checksum: expectedChecksum,
    });
    if (expectedChecksum !== data.checksum || expectedPayload !== data.qrPayload) {
      console.error('Count Paper Form checksum mismatch', { formId });
      return res.status(500).json({ error: 'COUNT_PAPER_INTEGRITY_ERROR' });
    }

    return res.status(200).json({
      form: {
        formId,
        countSessionId: data.countSessionId,
        serviceLabel: String(data.serviceLabel || ''),
        serviceDate: String(data.serviceDate || ''),
        stage: data.stage,
        locale: data.locale,
        templateVersion: data.templateVersion,
        checksum: data.checksum,
        qrPayload: data.qrPayload,
        createdAt: toOptionalIso(data.createdAt),
      },
    });
  } catch (error: any) {
    console.error('Count Paper Form Detail Error:', error);
    const message = String(error?.message || '');
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
