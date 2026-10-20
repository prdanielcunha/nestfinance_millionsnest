import assert from 'node:assert/strict';
import { assertFinanceCatalogScope } from '../server/vercel-handlers/finance/financeCatalogScope.js';
import { assertBookScope } from '../shared/finance/ledger/certifiedPosting.js';
import { expectedPayablesReleaseConfiguration, PAYABLE_RELEASE_FLAGS } from './finance-payables-release-config.mjs';

const org = 'synthetic_org', entity = 'synthetic_church';
function snapshot(collection = 'financeAccounts', values: Record<string,unknown> = {financeEntityId: entity}, path?: string) {
  return {exists:true,id:'synthetic_catalog',ref:{path:path ?? `organizations/${org}/${collection}/synthetic_catalog`},data:()=>values} as any;
}
for (const collection of ['financeAccounts','financeCategories','financeFunds'] as const) {
  assert.doesNotThrow(()=>assertFinanceCatalogScope(snapshot(collection),org,entity,collection));
  assert.doesNotThrow(()=>assertFinanceCatalogScope(snapshot(collection,{organizationId:org,financeEntityId:entity}),org,entity,collection));
  for (const bad of [snapshot(collection,{organizationId:'synthetic_other',financeEntityId:entity}),snapshot(collection,{organizationId:null,financeEntityId:entity}),snapshot(collection,{financeEntityId:'synthetic_other'}),snapshot(collection,{}),snapshot(collection,undefined,`organizations/synthetic_other/${collection}/synthetic_catalog`),snapshot(collection,undefined,`organizations/${org}/financeJournalEntries/synthetic_catalog`)]) {
    assert.throws(()=>assertFinanceCatalogScope(bad,org,entity,collection),/LEDGER_SCOPE_INVALID/);
  }
}
assert.throws(()=>assertBookScope({financeEntityId:entity},org,entity),/LEDGER_SCOPE_INVALID/,'book/transaction records remain strict');
const baseline={runtime:{containers:[{image:'synthetic',env:[{name:'AUTH_SWITCH',value:'true'},{name:'SYNTHETIC_SECRET',valueFrom:{secretKeyRef:{name:'synthetic-secret',key:'1'}}}]}]},serviceLabels:{unchanged:'true'}};
const expected=expectedPayablesReleaseConfiguration(baseline);
assert.deepEqual(baseline.runtime.containers[0].env.length,2,'input baseline stays unchanged');
assert.deepEqual(expected.serviceLabels,baseline.serviceLabels);
for(const flag of PAYABLE_RELEASE_FLAGS)assert.equal(expected.runtime.containers[0].env.find(e=>e.name===flag)?.value,'true');
assert.deepEqual(expected.runtime.containers[0].env.find(e=>e.name==='SYNTHETIC_SECRET'),baseline.runtime.containers[0].env[1]);
assert.deepEqual(expectedPayablesReleaseConfiguration(expected),expected,'enablement is idempotent');
console.log('FINANCE_LIVE_UNBLOCK_SCOPE_AND_EXACT_FLAGS_OK');
