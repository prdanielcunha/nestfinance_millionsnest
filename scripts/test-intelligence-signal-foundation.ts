import assert from 'node:assert/strict';
import {
  NESTFINANCE_SIGNAL_TYPES,
  CANONICAL_SIGNAL_SCHEMA_VERSION,
} from '../shared/intelligence/canonicalSignal.js';
import {
  buildFinanceSignalId,
  FINANCE_SIGNAL_DEFINITIONS,
  stageFinanceSignalOpen,
  stageFinanceSignalRefresh,
  stageFinanceSignalResolve,
} from '../server/vercel-handlers/finance/signalProjection.js';

const base = {
  organizationId: 'org_signal_test',
  financeEntityId: 'ent_signal_test',
  signalType: 'TRANSACTION_REVIEW_REQUIRED' as const,
  entityType: 'finance_transaction',
  entityId: 'tx_signal_test',
  sourceFactId: 'fact_test',
  sourceRefs: [
    { kind: 'record' as const, ref: 'organizations/org_signal_test/financeTransactions/tx_signal_test', version: 2 },
    { kind: 'audit' as const, ref: 'organizations/org_signal_test/financeAuditLogs/audit_test' },
  ],
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

const id = buildFinanceSignalId(base);
verify(/^signal_[a-f0-9]{64}$/.test(id), 'signal id is opaque and deterministic');
verify(id === buildFinanceSignalId({ ...base }), 'same source entity produces same signal id');
verify(
  id !== buildFinanceSignalId({ ...base, organizationId: 'org_other' }),
  'tenant participates in signal id',
);
verify(
  id !== buildFinanceSignalId({ ...base, signalType: 'TRANSACTION_CORRECTION_REQUIRED' }),
  'signal type participates in signal id',
);

for (const type of NESTFINANCE_SIGNAL_TYPES) {
  verify(Boolean(FINANCE_SIGNAL_DEFINITIONS[type]), `${type} has a deterministic definition`);
}
verify(CANONICAL_SIGNAL_SCHEMA_VERSION === 1, 'signal schema version is explicit');
verify(
  FINANCE_SIGNAL_DEFINITIONS.TRANSACTION_REVIEW_REQUIRED.requiredCapability === 'finance.review',
  'transaction review signal uses finance.review',
);
verify(
  FINANCE_SIGNAL_DEFINITIONS.INBOX_IDENTIFICATION_REQUIRED.requiredCapability === 'finance.create_drafts',
  'Inbox identification signal uses draft-entry capability',
);
verify(
  FINANCE_SIGNAL_DEFINITIONS.COUNT_DIVERGENCE_REVIEW_REQUIRED.attentionLevel === 'warning',
  'Count divergence uses deterministic warning attention',
);

const writes: Array<{ path: string; data: any; options: any }> = [];
const db = {
  collection(name: string) {
    return {
      doc(docId: string) {
        return { path: `${name}/${docId}` };
      },
    };
  },
} as any;
const transaction = {
  set(ref: any, data: any, options: any) {
    writes.push({ path: ref.path, data, options });
    return this;
  },
} as any;

stageFinanceSignalOpen(transaction, db, base);
stageFinanceSignalRefresh(transaction, db, { ...base, sourceFactId: 'fact_refresh' });
stageFinanceSignalResolve(transaction, db, { ...base, sourceFactId: 'fact_resolve' });

verify(writes.length === 3, 'open, refresh and resolve each stage one projection write');
verify(
  writes.every((write) => write.path === `intelligenceSignals/${id}`),
  'all lifecycle writes target the same deterministic signal document',
);
verify(
  writes[0].data.status === 'open' &&
    writes[0].data.openedByFactId === 'fact_test' &&
    writes[0].data.resolvedByFactId === null,
  'open projection records its source fact',
);
verify(
  writes[1].data.status === 'open' &&
    writes[1].data.lastFactId === 'fact_refresh' &&
    !Object.prototype.hasOwnProperty.call(writes[1].data, 'openedAt'),
  'refresh updates evidence without resetting openedAt',
);
verify(
  writes[2].data.status === 'resolved' &&
    writes[2].data.resolvedByFactId === 'fact_resolve' &&
    !Object.prototype.hasOwnProperty.call(writes[2].data, 'openedAt'),
  'resolve does not invent a historical opening timestamp',
);
verify(
  writes.every((write) => write.options?.merge === true),
  'signal lifecycle is modeled as a rebuildable merged projection',
);
verify(
  writes.every(
    (write) =>
      !Object.prototype.hasOwnProperty.call(write.data, 'comment') &&
      !Object.prototype.hasOwnProperty.call(write.data, 'amountCents') &&
      !Object.prototype.hasOwnProperty.call(write.data, 'sourceHash'),
  ),
  'signal projection does not copy free-form or material financial data',
);

console.log(`\nSignal Foundation contract totals: ${passed} Passed`);
