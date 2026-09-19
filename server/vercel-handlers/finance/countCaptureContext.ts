import type { Firestore } from 'firebase-admin/firestore';
import { isCountCaptureMaterialHidden } from '../../../shared/finance/countCapture.js';
import { isValidCountSessionId, type CountSessionStatus } from '../../../shared/finance/count.js';
import { resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';

export type CountCaptureProvenance = 'official_count_sheet' | 'free_form_note';

export function deriveOpenCountStage(status: CountSessionStatus | string): 'count_a' | 'count_b' {
  if (status === 'counting_a') return 'count_a';
  if (status === 'counting_b') return 'count_b';
  throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
}

export async function resolveCountCaptureContext(input: {
  db: Firestore;
  organizationId: string;
  financeEntityId: string;
  capture: any;
}) {
  const provenance: CountCaptureProvenance =
    input.capture?.provenance === 'free_form_note' ? 'free_form_note' : 'official_count_sheet';

  if (provenance === 'official_count_sheet') {
    const canonical = await resolveCanonicalCountPaperForm({
      db: input.db,
      organizationId: input.organizationId,
      financeEntityId: input.financeEntityId,
      formId: input.capture?.formId,
    });
    if (
      canonical.form.countSessionId !== input.capture?.countSessionId ||
      canonical.form.stage !== input.capture?.stage ||
      canonical.form.templateVersion !== input.capture?.templateVersion ||
      canonical.form.checksum !== input.capture?.checksum
    ) {
      throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
    }
    return {
      provenance,
      entityRef: canonical.entityRef,
      sessionRef: canonical.sessionRef,
      session: canonical.session,
      identity: {
        countSessionId: canonical.form.countSessionId,
        stage: canonical.form.stage,
        locale: canonical.form.locale,
        serviceLabel: canonical.form.serviceLabel,
        serviceDate: canonical.form.serviceDate,
        formId: canonical.form.id,
        templateVersion: canonical.form.templateVersion,
        checksum: canonical.form.checksum,
      },
    };
  }

  const countSessionId = String(input.capture?.countSessionId || '');
  if (!isValidCountSessionId(countSessionId)) throw new Error('COUNT_SESSION_NOT_FOUND');
  if (input.capture?.formId !== null || input.capture?.checksum !== null || input.capture?.templateVersion !== null) {
    throw new Error('COUNT_CAPTURE_FREE_FORM_INTEGRITY_FAILED');
  }

  const entityRef = input.db
    .collection('organizations')
    .doc(input.organizationId)
    .collection('financeEntities')
    .doc(input.financeEntityId);
  const sessionRef = entityRef.collection('countSessions').doc(countSessionId);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
  const session = sessionDoc.data() || {};
  if (session.organizationId !== input.organizationId || session.financeEntityId !== input.financeEntityId) {
    throw new Error('COUNT_SESSION_NOT_FOUND');
  }
  const stage = input.capture?.stage;
  if (stage !== 'count_a' && stage !== 'count_b') throw new Error('COUNT_CAPTURE_FREE_FORM_INTEGRITY_FAILED');
  const expectedStage = deriveOpenCountStage(String(session.status || ''));
  if (stage !== expectedStage) {
    if (isCountCaptureMaterialHidden(stage, session.status)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
    throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
  }

  return {
    provenance,
    entityRef,
    sessionRef,
    session,
    identity: {
      countSessionId,
      stage,
      locale: input.capture?.locale || 'PT',
      serviceLabel: String(session.serviceLabel || ''),
      serviceDate: String(session.serviceDate || ''),
      formId: null,
      templateVersion: null,
      checksum: null,
    },
  };
}
