import { COUNT_CASH_ENTRY_TYPES, COUNT_ENTRY_TYPES, type CountEntryDraft, type CountEntryType } from './count.js';
export type CountCollectionScope = 'cash_only' | 'legacy_mixed';
/** Missing scope denotes the historical contract; no stored record is migrated. */
export function countEntryTypesForSession(session: { collectionScope?: string | null }): readonly CountEntryType[] {
  return session.collectionScope === 'cash_only' ? COUNT_CASH_ENTRY_TYPES : COUNT_ENTRY_TYPES;
}
export function assertCountCollectionScope(session: { collectionScope?: string | null }, entries: readonly Pick<CountEntryDraft, 'type'>[]) {
  if (session.collectionScope === 'cash_only' && entries.some(entry => entry.type === 'pix')) {
    throw new Error('COUNT_CASH_ONLY_DIGITAL_SEPARATE');
  }
}
