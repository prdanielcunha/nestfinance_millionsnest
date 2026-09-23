import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { correctionIdFor, intelligenceDayKey } from './intelligenceGovernanceStore.js';
import { isIntelligenceCorrectionField, normalizeCorrectionValue } from '../../../shared/finance/intelligenceGovernance.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, documentType, fieldKey, suggestedValue, correctedValue } = req.body || {};
    const suggested = normalizeCorrectionValue(suggestedValue);
    const corrected = normalizeCorrectionValue(correctedValue);
    if (typeof financeEntityId !== 'string' || typeof documentType !== 'string' || !isIntelligenceCorrectionField(fieldKey) || !suggested || !corrected || suggested === corrected) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const { db, uid, organizationId } = await resolveFinanceRequestContext(req, 'finance.manage');
    const correctionId = correctionIdFor(documentType.slice(0, 60), fieldKey, suggested);
    const ref = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
      .collection('intelligenceCorrections').doc(correctionId);
    await ref.set({
      correctionId, organizationId, financeEntityId,
      documentType: documentType.slice(0, 60), fieldKey, suggestedValue: suggested,
      correctedValue: corrected, enabled: true, updatedByUid: uid,
      updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1,
    }, { merge: true });
    await db.collection('organizations').doc(organizationId).collection('financeIntelligenceUsage').doc(intelligenceDayKey()).set({
      corrections: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return res.status(200).json({ correctionId, enabled: true, correctedValue: corrected });
  } catch (error: any) {
    const message=String(error?.message||'');
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error:'FORBIDDEN' });
    if (error?.status) return res.status(error.status).json({ error:error.error||'UNAUTHORIZED' });
    console.error('Intelligence correction save error', error);
    return res.status(500).json({ error:'INTERNAL_SERVER_ERROR' });
  }
}
