import { createHash, randomBytes } from 'node:crypto';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  buildCountPaperQrPayload,
  isValidCountPaperFormId,
  type CountPaperLocale,
  type CountPaperStage,
} from '../../../shared/finance/countPaper.js';

export function generateCountPaperFormId() {
  return `cpf_${randomBytes(8).toString('hex')}`;
}

export function generateCountPaperAuditId() {
  return `audit_countpaper_${randomBytes(10).toString('hex')}`;
}

export function computeCountPaperChecksum(input: {
  organizationId: string;
  financeEntityId: string;
  countSessionId: string;
  formId: string;
  stage: CountPaperStage;
  locale: CountPaperLocale;
}) {
  if (!isValidCountPaperFormId(input.formId)) throw new Error('COUNT_PAPER_INVALID_FORM_ID');
  return createHash('sha256')
    .update(
      JSON.stringify({
        schema: 'nestfinance-count-paper-v1',
        organizationId: input.organizationId,
        financeEntityId: input.financeEntityId,
        countSessionId: input.countSessionId,
        formId: input.formId,
        stage: input.stage,
        locale: input.locale,
        templateVersion: COUNT_PAPER_TEMPLATE_VERSION,
      }),
      'utf8',
    )
    .digest('hex')
    .slice(0, 24);
}

export function buildCountPaperIdentity(input: {
  organizationId: string;
  financeEntityId: string;
  countSessionId: string;
  formId: string;
  stage: CountPaperStage;
  locale: CountPaperLocale;
}) {
  const checksum = computeCountPaperChecksum(input);
  return {
    formId: input.formId,
    templateVersion: COUNT_PAPER_TEMPLATE_VERSION,
    checksum,
    qrPayload: buildCountPaperQrPayload({
      formId: input.formId,
      templateVersion: COUNT_PAPER_TEMPLATE_VERSION,
      checksum,
    }),
  };
}

export function toOptionalIso(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return typeof value === 'string' ? value : null;
}
