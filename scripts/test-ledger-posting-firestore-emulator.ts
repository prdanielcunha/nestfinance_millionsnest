import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { postingExecutionFixture as fixture } from './fixtures/postingExecutionFixture.js';
import { executeLedgerPosting } from '../server/vercel-handlers/finance/ledgerExecutionStore.js';
import { seedPostingExecution } from './fixtures/seedPostingExecution.js';

if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'))
  throw Error('Ledger execution integration requires an isolated demo Firestore emulator');
resetFirebaseAdminForTests();const {firestore:db}=getFirebaseAdmin();
const flag=process.env.NESTFINANCE_LEDGER_POSTING_ENABLED;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const unique=()=>`org_synthetic_posting_${randomBytes(8).toString('hex')}`;
type Fixture=ReturnType<typeof fixture>;
async function seed(input:Fixture){
  return seedPostingExecution(db,input);
}
function request(input:Fixture,key='synthetic-post-key',actorUid='synthetic_poster') {
  return {db,organizationId:input.transaction.organizationId,financeEntityId:input.transaction.financeEntityId,actorUid,
    command:{transactionId:input.transaction.id,expectedVersion:input.expectedVersion,idempotencyKey:key,requestId:'request_'+key}};
}
async function assertNoEffect(input:Fixture,expectedProjectionCount=0){
  const org=db.collection('organizations').doc(input.transaction.organizationId);
  assert.equal((await org.collection('financeJournalEntries').get()).size,0);
  assert.equal((await org.collection('financeAggregates').get()).size,expectedProjectionCount);
  assert.equal((await org.collection('financeIdempotency').get()).size,0);
  assert.equal((await org.collection('financeTransactions').doc(input.transaction.id).get()).data()?.status,'approved_for_posting');
}
try {
  const disabled=fixture('income',unique());await seed(disabled);
  delete process.env.NESTFINANCE_LEDGER_POSTING_ENABLED;
  await assert.rejects(executeLedgerPosting(request(disabled)),/FINANCE_LEDGER_POSTING_NOT_ENABLED/);await assertNoEffect(disabled);
  process.env.NESTFINANCE_LEDGER_POSTING_ENABLED='true';
  for(const [kind,accountId]of [['income','cash'],['expense','cash'],['expense','liability'],['transfer','cash'],['liability_settlement','cash']] as const){
    const input=fixture(kind,unique(),{accountId,fundId:kind==='income'||kind==='expense'?'mission':undefined});
    const {org,txRef}=await seed(input),command=request(input);
    const [first,retry]=await Promise.all([executeLedgerPosting(command),executeLedgerPosting(command)]);
    assert.deepEqual(first,retry);assert.equal(first.version,5);
    const journals=await org.collection('financeJournalEntries').get();assert.equal(journals.size,1);
    const journal=journals.docs[0].data();assert.equal(journal.sourceTransactionId,input.transaction.id);
    assert.equal(journal.effectiveDay,'2026-10-10');
    assert.equal(journal.lines.reduce((n:number,l:any)=>n+l.debitCents,0),12345);
    assert.equal(journal.lines.reduce((n:number,l:any)=>n+l.creditCents,0),12345);
    assert.equal((await txRef.get()).data()?.status,'posted');
    const projections=await org.collection('financeAggregates').get();assert.ok(projections.size>=2);
    for(const projection of projections.docs){const value=projection.data();assert.equal(value.postingCount,1);
      assert.equal(value.basis,'posted_movements_since_initialization');assert.equal(value.balanceCents,undefined);
      assert.equal(value.openingBalanceCents,undefined);}
    const accountMovements=projections.docs.map(value=>value.data()).filter(value=>value.kind==='account'&&value.periodKey==='all')
      .map(value=>({accountId:value.resourceId,deltaCents:value.postedMovementCents})).sort((a,b)=>a.accountId.localeCompare(b.accountId));
    const expected=kind==='income'?[{accountId:'cash',deltaCents:12345}]:kind==='expense'?[{accountId,deltaCents:accountId==='liability'?12345:-12345}]:
      kind==='transfer'?[{accountId:'bank',deltaCents:12345},{accountId:'cash',deltaCents:-12345}]:
      [{accountId:'bank',deltaCents:-12345},{accountId:'liability',deltaCents:-12345}];
    assert.deepEqual(accountMovements,expected,'persist exact signed effects without treating transfers or settlements as income/expense');
    assert.equal((await org.collection('financeAccounts').doc(accountId).get()).data()?.openingBalanceCents,undefined);
    assert.equal((await org.collection('financeAuditLogs').get()).size,1);
    const facts=await db.collection('intelligenceFacts').where('organizationId','==',input.transaction.organizationId).get();
    assert.equal(facts.size,2,'journal/source and canonical audit facts must commit atomically');
    await assert.rejects(executeLedgerPosting(request(input,'synthetic-different-key')));
    assert.equal((await org.collection('financeJournalEntries').get()).size,1);
  }
  const concurrent=fixture('income',unique());const {org:concurrentOrg}=await seed(concurrent);
  const outcomes=await Promise.allSettled([executeLedgerPosting(request(concurrent,'synthetic-actor-one','synthetic_actor_one')),
    executeLedgerPosting(request(concurrent,'synthetic-actor-two','synthetic_actor_two'))]);
  assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);
  assert.equal((await concurrentOrg.collection('financeJournalEntries').get()).size,1);
  for(const scenario of ['stale','closed','foreign','mapping','projection','baseline','count_lock'] as const){
    const source={countSessionId:'cnt_111111111111111111111111',countVersion:3,countEntryType:'tithe',sourceCaptureIds:[],serviceDate:'2026-10-10',receivedDate:'2026-10-10'};
    const input=fixture('income',unique(),scenario==='count_lock'?{countSource:source}:{}),{org,txRef}=await seed(input);
    if(scenario==='stale')await txRef.update({description:'Changed after approval'});
    if(scenario==='closed')await org.collection('financeLedgerPeriods').doc(`${input.transaction.financeEntityId}:2026-10`).set({
      organizationId:input.transaction.organizationId,financeEntityId:input.transaction.financeEntityId,state:'closed',version:1,postedEntryCount:0});
    if(scenario==='foreign')await org.collection('financeAccounts').doc('cash').update({organizationId:'org_synthetic_foreign'});
    if(scenario==='mapping')await org.collection('financeLedgerAccounts').doc('la_cash').delete();
    if(scenario==='baseline')await org.collection('financeLedgerExecution').doc(input.transaction.financeEntityId).update({effectiveStartDate:'2026-10-11'});
    if(scenario==='projection')await org.collection('financeAggregates').doc('ledger_'+digest(`${input.transaction.financeEntityId}:account:cash:all`)).set({
      organizationId:input.transaction.organizationId,financeEntityId:input.transaction.financeEntityId,kind:'account',resourceId:'cash',periodKey:'all',currency:'BRL',version:1,postingCount:1});
    if(scenario==='count_lock'){
      const {hashPayload}=await import('../server/vercel-handlers/finance/idempotencyHelper.js');
      const key=hashPayload([input.transaction.financeEntityId,source.countSessionId,source.countEntryType,input.transaction.paymentMethod]);
      await org.collection('financeUniqueKeys').doc(`ledger_count_${key}`).set({organizationId:input.transaction.organizationId,
        financeEntityId:input.transaction.financeEntityId,transactionId:'tx_synthetic_previous'});
    }
    await assert.rejects(executeLedgerPosting(request(input)));await assertNoEffect(input,scenario==='projection'?1:0);
  }
  console.log('Ledger Firestore execution: default OFF, 5 real balanced/idempotent flows, actor race and 7 atomic rejection cases passed');
}finally{
  if(flag===undefined)delete process.env.NESTFINANCE_LEDGER_POSTING_ENABLED;else process.env.NESTFINANCE_LEDGER_POSTING_ENABLED=flag;
  await db.terminate();
}
