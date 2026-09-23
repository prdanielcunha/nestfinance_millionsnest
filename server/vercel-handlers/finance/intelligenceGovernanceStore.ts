import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { DocumentTransactionAnalysis, DocumentTransactionProviderResult } from '../../../shared/finance/documentTransactionIntelligence.js';
import type { DocumentIntelligenceGovernance, IntelligenceCorrectionField, IntelligenceCorrectionHint } from '../../../shared/finance/intelligenceGovernance.js';

const DEFAULT_DAILY_CALL_LIMIT = 100;
const DEFAULT_EVIDENCE_ATTEMPT_LIMIT = 2;

function boundedEnv(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

export const intelligenceDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export function buildIntelligenceCacheKey(input: {
  evidenceSha256: string;
  entityTaxId: string;
  categories: unknown;
  locale: string;
  model: string;
  providerRevision: string;
  promptRevision: string;
  schemaVersion: number;
}) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function entityRef(db: Firestore, organizationId: string, financeEntityId: string) {
  return db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
}

export async function readIntelligenceCache(input: {
  db: Firestore; organizationId: string; financeEntityId: string; cacheKey: string;
}) {
  const snap = await entityRef(input.db, input.organizationId, input.financeEntityId)
    .collection('intelligenceCache').doc(input.cacheKey).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.analysis || !data.providerResult || !data.governance) return null;
  return {
    analysis: data.analysis as DocumentTransactionAnalysis,
    providerResult: data.providerResult as DocumentTransactionProviderResult,
    governance: data.governance as DocumentIntelligenceGovernance,
    provider: String(data.provider || ''),
    model: String(data.model || ''),
    revision: String(data.revision || ''),
  };
}

export async function writeIntelligenceCache(input: {
  db: Firestore; organizationId: string; financeEntityId: string; cacheKey: string;
  analysis: DocumentTransactionAnalysis; providerResult: DocumentTransactionProviderResult;
  governance: DocumentIntelligenceGovernance; provider: string; model: string; revision: string;
}) {
  await entityRef(input.db, input.organizationId, input.financeEntityId)
    .collection('intelligenceCache').doc(input.cacheKey).set({
      cacheKey: input.cacheKey,
      analysis: input.analysis,
      providerResult: input.providerResult,
      governance: input.governance,
      provider: input.provider,
      model: input.model,
      revision: input.revision,
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    }, { merge: false });
}

export async function reserveIntelligenceCall(input: {
  db: Firestore; organizationId: string; financeEntityId: string; evidenceId: string; model: string;
}) {
  const day = intelligenceDayKey();
  const usageRef = input.db.collection('organizations').doc(input.organizationId).collection('financeIntelligenceUsage').doc(day);
  const attemptRef = entityRef(input.db, input.organizationId, input.financeEntityId)
    .collection('intelligenceAttempts').doc(input.evidenceId);
  const dailyLimit = boundedEnv('NESTFINANCE_INTELLIGENCE_DAILY_CALL_LIMIT', DEFAULT_DAILY_CALL_LIMIT, 2000);
  const attemptLimit = boundedEnv('NESTFINANCE_INTELLIGENCE_EVIDENCE_ATTEMPT_LIMIT', DEFAULT_EVIDENCE_ATTEMPT_LIMIT, 5);

  await input.db.runTransaction(async (tx) => {
    const [usageSnap, attemptSnap] = await Promise.all([tx.get(usageRef), tx.get(attemptRef)]);
    const calls = Number(usageSnap.data()?.providerCalls || 0);
    const attempts = Number(attemptSnap.data()?.attempts || 0);
    if (calls >= dailyLimit) throw new Error('INTELLIGENCE_DAILY_BUDGET_EXHAUSTED');
    if (attempts >= attemptLimit) throw new Error('INTELLIGENCE_RETRY_LIMIT_EXHAUSTED');
    tx.set(usageRef, {
      providerCalls: calls + 1,
      cacheHits: Number(usageSnap.data()?.cacheHits || 0),
      successes: Number(usageSnap.data()?.successes || 0),
      failures: Number(usageSnap.data()?.failures || 0),
      totalLatencyMs: Number(usageSnap.data()?.totalLatencyMs || 0),
      corrections: Number(usageSnap.data()?.corrections || 0),
      model: input.model,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(attemptRef, {
      attempts: attempts + 1,
      model: input.model,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { day, dailyLimit, attemptLimit };
}

export async function recordIntelligenceOutcome(input: {
  db: Firestore; organizationId: string; cacheHit: boolean; success: boolean; latencyMs: number;
}) {
  const ref = input.db.collection('organizations').doc(input.organizationId)
    .collection('financeIntelligenceUsage').doc(intelligenceDayKey());
  await ref.set({
    cacheHits: FieldValue.increment(input.cacheHit ? 1 : 0),
    successes: FieldValue.increment(input.success ? 1 : 0),
    failures: FieldValue.increment(input.success ? 0 : 1),
    totalLatencyMs: FieldValue.increment(Math.max(0, Math.round(input.latencyMs))),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function loadCorrectionHints(input: {
  db: Firestore; organizationId: string; financeEntityId: string; documentType: string;
}): Promise<IntelligenceCorrectionHint[]> {
  if (!input.documentType || input.documentType === 'unknown') return [];
  const snap = await entityRef(input.db, input.organizationId, input.financeEntityId)
    .collection('intelligenceCorrections')
    .where('documentType', '==', input.documentType)
    .where('enabled', '==', true)
    .limit(20).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      correctionId: doc.id,
      fieldKey: data.fieldKey as IntelligenceCorrectionField,
      correctedValue: String(data.correctedValue || ''),
    };
  }).filter((item) => item.correctedValue);
}

export function correctionIdFor(documentType: string, fieldKey: string, suggestedValue: string) {
  return createHash('sha256').update([documentType, fieldKey, suggestedValue].join('|')).digest('hex').slice(0, 32);
}
