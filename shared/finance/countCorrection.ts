import { compareCountEntries, calculateCountEntriesTotalCents, normalizeCountEntries, isCountEntryType } from './count.js';

export function normalizeCorrectionReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 10 || reason.length > 500) throw new Error('COUNT_CORRECTION_REASON_REQUIRED');
  return reason;
}

export function normalizeCorrectionZeroConfirmations(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4 || value.some(type => !isCountEntryType(type)) ||
    new Set(value).size !== value.length) throw new Error('COUNT_CORRECTION_INVALID_ZERO_CONFIRMATIONS');
  return [...value].sort();
}

/** Editing a sealed side is participation even after a later editor replaces it. */
export function hasCountCorrectionIndependence(session: any, target: 'countA' | 'countB', actorUid: string): boolean {
  const otherTarget = target === 'countA' ? 'countB' : 'countA';
  const other = session[otherTarget];
  if (!actorUid || !(other?.countedByUid || other?.enteredByUid)) return false;
  const participated = (record: any) => Boolean(record &&
    [record.countedByUid, record.enteredByUid, record.correctedByUid].includes(actorUid));
  if (participated(other)) return false;
  return !(Array.isArray(session.corrections) && session.corrections.some((correction: any) =>
    correction.target === otherTarget &&
    (correction.actorUid === actorUid || participated(correction.before) || participated(correction.after))));
}

/** No financial side effects: a proposed/posted source requires a linked adjustment,
 * never an overwrite of the evidence that authorized the existing entry. */
export function prepareCountCorrection(session: any, input: {
  expectedVersion: number; target: 'countA' | 'countB'; entries: unknown; actorUid: string;
  confirmedZeroEntryTypes?: unknown;
}) {
  if (!['matched', 'divergent'].includes(session.status)) throw new Error('COUNT_CORRECTION_INVALID_STATE');
  if (session.version !== input.expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
  if (session.countProposal || ['reviewed', 'deposited', 'reconciled', 'closed'].includes(session.workflowState)) {
    throw new Error('COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED');
  }
  if (!Array.isArray(session.countA?.entries) || !Array.isArray(session.countB?.entries)) {
    throw new Error('COUNT_CORRECTION_REQUIRES_BOTH_COUNTS');
  }
  if ((session.corrections?.length || 0) >= 50) throw new Error('COUNT_CORRECTION_LIMIT_REACHED');
  if (!hasCountCorrectionIndependence(session, input.target, input.actorUid)) {
    throw new Error('COUNT_CORRECTION_INDEPENDENT_COUNTER_REQUIRED');
  }
  const entries = normalizeCountEntries(input.entries as any);
  if (!entries.length) throw new Error('COUNT_EMPTY_CORRECTION');
  const before = normalizeCountEntries(session[input.target].entries);
  const confirmedZeroEntryTypes = normalizeCorrectionZeroConfirmations(input.confirmedZeroEntryTypes);
  if (before.some(entry => entry.totalCents > 0 &&
    !(entries.find(item => item.type === entry.type)?.totalCents) && !confirmedZeroEntryTypes.includes(entry.type))) {
    throw new Error('COUNT_CORRECTION_ZERO_CONFIRMATION_REQUIRED');
  }
  if (JSON.stringify(entries) === JSON.stringify(before)) throw new Error('COUNT_CORRECTION_NO_CHANGE');
  const comparison = compareCountEntries(
    input.target === 'countA' ? entries : session.countA.entries,
    input.target === 'countB' ? entries : session.countB.entries,
  );
  return { entries, confirmedZeroEntryTypes, totalCents: calculateCountEntriesTotalCents(entries), comparison,
    status: comparison.matched ? 'matched' as const : 'divergent' as const };
}
