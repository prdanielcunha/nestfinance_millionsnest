import assert from 'node:assert/strict';
import { NESTFINANCE_FACT_EVENT_TYPES } from '../shared/intelligence/canonicalFact.js';
import { buildFinanceFactEventId } from '../server/vercel-handlers/finance/factStream.js';

const base = {
  organizationId: 'org_test',
  eventType: 'COUNT_OPENED' as const,
  entityType: 'count_session',
  entityId: 'count_test',
  correlationId: 'req_test',
};

const first = buildFinanceFactEventId(base);
const retry = buildFinanceFactEventId({ ...base });
const anotherRequest = buildFinanceFactEventId({ ...base, correlationId: 'req_other' });
const anotherTenant = buildFinanceFactEventId({ ...base, organizationId: 'org_other' });

assert.match(first, /^fact_[a-f0-9]{64}$/);
assert.equal(first, retry, 'same source event must produce the same canonical event id');
assert.notEqual(first, anotherRequest, 'a distinct correlated operation must produce a distinct event id');
assert.notEqual(first, anotherTenant, 'tenant scope must participate in the event id');
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('COUNT_OPENED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('DOCUMENT_ATTACHED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('ATTENTION_STATE_OBSERVED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('RECONCILIATION_REVERSED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('INBOX_ITEM_CREATED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('REPORT_READY'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('RECONCILIATION_EXCEPTION_FOUND'));

console.log('Fact Foundation contract checks passed.');
