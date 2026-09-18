import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUDIT_READ_LIMIT,
  buildAuditTimelineItem,
} from '../shared/finance/auditReadModel.js';

const [handler, page, service, gateway, indexes] = await Promise.all([
  readFile('server/vercel-handlers/finance/auditList.ts', 'utf8'),
  readFile('src/pages/finance/AuditPage.tsx', 'utf8'),
  readFile('src/services/auditService.ts', 'utf8'),
  readFile('api/finance-gateway.ts', 'utf8'),
  readFile('firestore.indexes.json', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const item = buildAuditTimelineItem({
  eventId: 'audit_test',
  occurredAt: '2026-09-18T12:00:00.000Z',
  actorKind: 'user',
  actorDisplayName: 'Pessoa Teste',
  data: {
    resource: 'transaction',
    resourceId: 'tx_123',
    action: 'transaction.updated',
    requestId: 'req_123',
    beforeHash: 'secret-before',
    afterHash: 'secret-after',
    idempotencyKey: 'secret-idempotency',
    metadata: {
      status: 'draft',
      reasonCode: 'correction_requested',
      amountCents: 999999,
      approvalSourceHash: 'secret-approval',
      comment: 'private free form',
      versionBefore: 2,
      versionAfter: 3,
    },
  },
});

const serialized = JSON.stringify(item);
verify(item.metadata.status === 'draft', 'safe status is preserved for audit explanation');
verify(item.metadata.reasonCode === 'correction_requested', 'safe reason code is preserved');
verify(item.metadata.versionBefore === 2 && item.metadata.versionAfter === 3, 'safe version transition is preserved');
for (const secret of ['secret-before', 'secret-after', 'secret-idempotency', 'secret-approval', '999999', 'private free form']) {
  verify(!serialized.includes(secret), 'read model excludes sensitive/internal value ' + secret);
}

verify(AUDIT_READ_LIMIT === 200, 'audit read model has an explicit bounded limit');
verify(
  handler.includes("resolveFinanceRequestContext(req, 'finance.view')") &&
    handler.includes("where('financeEntityId', '==', financeEntityId)") &&
    handler.includes("orderBy('createdAt', 'desc')") &&
    handler.includes('limit(AUDIT_READ_LIMIT + 1)'),
  'server reads only authorized, entity-scoped, bounded chronological audit history',
);
for (const forbidden of [
  'stageFinanceFact',
  'stageFinanceSignal',
  'financeTransactions',
  'financeBalances',
  'financeJournalEntries',
  'financeAggregates',
  'beforeHash:',
  'afterHash:',
  'idempotencyKey:',
]) {
  verify(!handler.includes(forbidden), 'audit handler has no mutation/sensitive dependency on ' + forbidden);
}
verify(!/\b(?:t|transaction)\.set\s*\(/u.test(handler), 'audit handler has no Firestore transaction set call');
verify(!/\b(?:t|transaction)\.update\s*\(/u.test(handler), 'audit handler has no Firestore transaction update call');
verify(!/\b(?:t|transaction)\.delete\s*\(/u.test(handler), 'audit handler has no Firestore transaction delete call');

verify(
  page.includes("PT: {") && page.includes("EN: {") && page.includes("ES: {"),
  'Audit UI is localized in PT/EN/ES',
);
verify(
  page.includes('Quem') && page.includes('Quando') && page.includes('Detalhes de auditoria'),
  'primary Audit UX exposes human who/when/detail language',
);
verify(
  !page.includes('beforeHash') && !page.includes('afterHash') && !page.includes('idempotencyKey'),
  'Audit UI does not expose raw hashes or idempotency keys',
);
verify(
  service.includes('operation=audit-list') && gateway.includes("case 'audit-list'"),
  'Audit client uses the certified finance gateway operation',
);
verify(
  indexes.includes('"collectionGroup": "financeAuditLogs"') &&
    indexes.includes('"fieldPath": "createdAt"'),
  'Firestore index supports entity-scoped chronological audit reads',
);

console.log('\nAudit Read Model totals: ' + passed + ' Passed');
