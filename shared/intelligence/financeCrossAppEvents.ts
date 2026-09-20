import type { NestFinanceFactEventType } from './canonicalFact.js';

export const NESTFINANCE_BLUEPRINT_CROSS_APP_EVENTS = [
  'COUNT_OPENED',
  'COUNT_COMPLETED',
  'RECONCILIATION_STARTED',
  'RECONCILIATION_EXCEPTION_FOUND',
  'RECONCILIATION_COMPLETED',
  'INBOX_ITEM_CREATED',
  'INBOX_ITEM_RESOLVED',
  'REPORT_READY',
  'ENTRY_POSTED',
  'REVERSAL_POSTED',
  'AUDIT_EVENT_RECORDED',
] as const;

export type NestFinanceBlueprintCrossAppEvent =
  (typeof NESTFINANCE_BLUEPRINT_CROSS_APP_EVENTS)[number];

export type CrossAppEventImplementationState =
  | 'emitted'
  | 'reserved'
  | 'blocked_by_posting';

export type CrossAppEventImplementation = {
  state: CrossAppEventImplementationState;
  internalFactType: NestFinanceFactEventType | null;
  note: string;
};

/**
 * Exact blueprint-facing event vocabulary.
 *
 * This table is intentionally honest about implementation coverage. It must
 * never translate a partial internal state into a stronger ecosystem claim.
 */
export const NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION: Record<
  NestFinanceBlueprintCrossAppEvent,
  CrossAppEventImplementation
> = {
  COUNT_OPENED: {
    state: 'emitted',
    internalFactType: 'COUNT_OPENED',
    note: 'Emitted atomically when a canonical Count session is opened.',
  },
  COUNT_COMPLETED: {
    state: 'emitted',
    internalFactType: 'COUNT_COMPLETED',
    note: 'Emitted only after Count values match.',
  },
  RECONCILIATION_STARTED: {
    state: 'emitted',
    internalFactType: 'RECONCILIATION_STARTED',
    note: 'Emitted once when the first certified confirmation creates a persisted statement/account reconciliation session.',
  },
  RECONCILIATION_EXCEPTION_FOUND: {
    state: 'emitted',
    internalFactType: 'RECONCILIATION_EXCEPTION_FOUND',
    note: 'Emitted for an explicit human reversal/correction inside a persisted reconciliation session; preview-only no-match states remain non-events.',
  },
  RECONCILIATION_COMPLETED: {
    state: 'reserved',
    internalFactType: 'RECONCILIATION_MATCHED',
    note: 'A matched statement line does not prove the whole reconciliation is complete.',
  },
  INBOX_ITEM_CREATED: {
    state: 'emitted',
    internalFactType: 'INBOX_ITEM_CREATED',
    note: 'Emitted only for accepted, non-duplicate evidence that enters actionable Inbox work.',
  },
  INBOX_ITEM_RESOLVED: {
    state: 'emitted',
    internalFactType: 'INBOX_ITEM_RESOLVED',
    note: 'Emitted when the human review resolves the Inbox item.',
  },
  REPORT_READY: {
    state: 'emitted',
    internalFactType: 'REPORT_READY',
    note: 'Emitted after a zero-blocker period receives source-bound human review; it is not an official accounting report or period close.',
  },
  ENTRY_POSTED: {
    state: 'blocked_by_posting',
    internalFactType: 'TRANSACTION_POSTED',
    note: 'Posting remains locked; no event may be emitted until a real certified posting mutation exists.',
  },
  REVERSAL_POSTED: {
    state: 'blocked_by_posting',
    internalFactType: null,
    note: 'Posting reversal remains locked with the posting engine.',
  },
  AUDIT_EVENT_RECORDED: {
    state: 'emitted',
    internalFactType: 'AUDIT_EVENT_RECORDED',
    note: 'Emitted atomically for finance-entity audit writes through the canonical audit helper; historical completeness is certified independently by the audit projection coverage workflow.',
  },
};
