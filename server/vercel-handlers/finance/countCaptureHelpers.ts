import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  isValidCountPaperFormId,
  type CountPaperIdentity,
  type CountPaperStage,
} from '../../../shared/finance/countPaper.js';
import { parseCountPaperIdentityPayload } from '../../../shared/finance/countCapture.js';
import { buildCountPaperIdentity } from './countPaperHelpers.js';

export function generateCountCaptureId() {
  return `cpc_${randomBytes(12).toString('hex')}`;
}

export function generateCountCaptureAuditId() {
  return `audit_countcapture_${randomBytes(10).toString('hex')}`;
}

export function buildCountCaptureObjectPaths(input: {
  organizationId: string;
  financeEntityId: string;
  captureId: string;
  originalContentType: string;
  normalizedContentType: string;
}) {
  const extension = (contentType: string) => {
    if (contentType === 'image/png') return 'png';
    if (contentType === 'image/webp') return 'webp';
    if (contentType === 'image/heic') return 'heic';
    if (contentType === 'image/heif') return 'heif';
    return 'jpg';
  };
  const base = `organizations/${input.organizationId}/financeEntities/${input.financeEntityId}/countCaptures/${input.captureId}`;
  return {
    originalPath: `${base}/original.${extension(input.originalContentType)}`,
    normalizedPath: `${base}/normalized.${extension(input.normalizedContentType)}`,
  };
}

export async function resolveCanonicalCountPaperForm(input: {
  db: Firestore;
  organizationId: string;
  financeEntityId: string;
  formId?: unknown;
  qrPayload?: unknown;
}) {
  let requestedIdentity: CountPaperIdentity | null = null;
  if (typeof input.qrPayload === 'string' && input.qrPayload.trim()) {
    requestedIdentity = parseCountPaperIdentityPayload(input.qrPayload.trim());
  }
  const formId = requestedIdentity?.formId || input.formId;
  if (!isValidCountPaperFormId(formId)) throw new Error('COUNT_CAPTURE_INVALID_FORM_ID');

  const entityRef = input.db
    .collection('organizations')
    .doc(input.organizationId)
    .collection('financeEntities')
    .doc(input.financeEntityId);
  const formRef = entityRef.collection('countPaperForms').doc(formId);
  const formDoc = await formRef.get();
  if (!formDoc.exists) throw new Error('COUNT_CAPTURE_FORM_NOT_FOUND');
  const form = formDoc.data() || {};
  if (
    form.organizationId !== input.organizationId ||
    form.financeEntityId !== input.financeEntityId ||
    form.id !== formId ||
    form.templateVersion !== COUNT_PAPER_TEMPLATE_VERSION
  ) {
    throw new Error('COUNT_CAPTURE_FORM_NOT_FOUND');
  }

  const canonicalIdentity = buildCountPaperIdentity({
    organizationId: input.organizationId,
    financeEntityId: input.financeEntityId,
    countSessionId: String(form.countSessionId || ''),
    formId,
    stage: form.stage as CountPaperStage,
    locale: form.locale,
  });
  if (canonicalIdentity.checksum !== form.checksum || canonicalIdentity.qrPayload !== form.qrPayload) {
    throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
  }
  if (
    requestedIdentity &&
    (requestedIdentity.templateVersion !== canonicalIdentity.templateVersion ||
      requestedIdentity.checksum !== canonicalIdentity.checksum)
  ) {
    throw new Error('COUNT_CAPTURE_QR_TAMPERED');
  }

  const sessionRef = entityRef.collection('countSessions').doc(String(form.countSessionId || ''));
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
  const session = sessionDoc.data() || {};
  if (session.organizationId !== input.organizationId || session.financeEntityId !== input.financeEntityId) {
    throw new Error('COUNT_CAPTURE_FORM_NOT_FOUND');
  }

  return {
    entityRef,
    formRef,
    form: {
      id: formId,
      countSessionId: String(form.countSessionId || ''),
      stage: form.stage as CountPaperStage,
      locale: form.locale,
      serviceLabel: String(form.serviceLabel || ''),
      serviceDate: String(form.serviceDate || ''),
      templateVersion: canonicalIdentity.templateVersion,
      checksum: canonicalIdentity.checksum,
      qrPayload: canonicalIdentity.qrPayload,
    },
    sessionRef,
    session,
  };
}
