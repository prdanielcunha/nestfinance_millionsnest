import assert from 'node:assert/strict';
import { runIndependentFinanceRecovery } from '../server/vercel-handlers/finance/independentConnectPendingRecovery.js';
import { financeConnectReceiptExtension } from '../server/vercel-handlers/finance/connectPendingReceiptOutbox.js';
const secret = 'synthetic-source-only-secret-more-than-32-chars';
const targets = JSON.stringify(Object.fromEntries(['org-a','org-b'].map(id => [id,
  { recipientUid: 'synthetic-operator', conversationId: 'synthetic-thread' }])));
let touched = 0;
assert.equal((await runIndependentFinanceRecovery({ enabled: false, db: () => { touched++; throw Error(); } })).tenants, 0);
assert.equal(touched, 0);
for (const operatorTargetsJson of [undefined, '{}', '[]', '{"org-a":{"recipientUid":"x","conversationId":"../bad"}}']) {
  await assert.rejects(runIndependentFinanceRecovery({ enabled: true, signingSecret: secret, operatorTargetsJson,
    db: () => { touched++; throw Error(); } }), /NOT_CONFIGURED/);
}
assert.equal(touched, 0);

const records = new Map<string, Map<string, any>>();
for (const org of ['org-a','org-b']) {
  const rows = new Map<string, any>(); records.set(org, rows);
  for (let n = 0; n < 13; n++) {
    rows.set(n.toString(16).padStart(64, '0'), {
      ...financeConnectReceiptExtension({ enabled: true, organizationId: org, financeEntityId: 'entity-a',
        evidenceId: 'evd_'+'a'.repeat(32), version: 3 }),
    });
  }
}
// Corrupt cross-tenant receipt must never be passed into an entity recovery.
records.get('org-a')!.get('0'.repeat(64)).connectOutbox.organizationId = 'org-b';
let failOrgA = false;
const db: any = {
  collection(name: string) { assert.equal(name, 'organizations'); return { doc(org: string) {
    assert(['org-a','org-b'].includes(org));
    if (org === 'org-a' && failOrgA) throw Error('synthetic-outage');
    const rows=records.get(org)!;
    const ref = (id: string) => ({ id, async get() { return { data: () => structuredClone(rows.get(id)) }; }, rows });
    return { collection(key: string) {
      assert.equal(key, 'financeIdempotency');
      return { doc: ref, where(field: string, op: string, states: string[]) {
        assert.deepEqual([field,op,states],['connectOutbox.state','in',['pending','processing']]);
        let after = '', take = 0;
        const q: any = { orderBy(key: string) { assert.equal(key, '__name__'); return q; },
          limit(n: number) { take=n; assert(n<=5); return q; }, startAfter(id: string) { after=id; return q; },
          async get() { return { docs: [...rows.keys()].sort().filter(id => id > after && rows.get(id).connectOutbox)
            .slice(0,take).map(id => ({ id, data: () => structuredClone(rows.get(id)) })) }; } };
        return q;
      } };
    } };
  } }; },
  async runTransaction(fn: any) { return fn({ get: (r: any) => r.get(), set: (r: any, data: any) => {
    assert.equal(r.id, '_connectRecoveryCursorV1'); r.rows.set(r.id, data);
  } }); },
};
const calls: any[] = [];
const recover: any = async (arg: any) => { calls.push(arg); return 'deferred'; };
const options = { enabled: true, signingSecret: secret, operatorTargetsJson: targets, db: () => db, recover };
assert.equal((await runIndependentFinanceRecovery(options)).scanned,10);
assert.equal(calls.length,9); // foreign marker excluded
await runIndependentFinanceRecovery(options);
await runIndependentFinanceRecovery(options);
assert(calls.some(c=>c.receiptKey==='c'.padStart(64,'0')), 'later pages reached across restart');
assert.equal((await runIndependentFinanceRecovery(options)).scanned,0, 'empty pages wrap');
assert.equal((await runIndependentFinanceRecovery(options)).scanned,10);
failOrgA=true;
const result=await runIndependentFinanceRecovery(options);
assert.equal(result.failures,1);
assert.equal(result.tenants,2);
assert.equal(result.scanned,5,'one tenant failure cannot starve next tenant');
assert(!JSON.stringify(result).includes('org-'));
for (const c of calls) {
  assert.equal(c.financeEntityId,'entity-a'); assert(c.organizationId==='org-a'||c.organizationId==='org-b');
  assert.equal(c.enabled,true);
}
console.log('Independent finance recovery PASS: OFF, configuration, bounded scopes, foreign receipt denial, durable pagination/wrap, tenant failure isolation, aggregate-only logs.');
