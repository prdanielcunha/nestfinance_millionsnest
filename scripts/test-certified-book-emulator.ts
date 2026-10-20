import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Transaction } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { certifiedPlanReferences, ledgerConfigurationKey, type CertifiedLedgerConfiguration } from '../shared/finance/ledger/certifiedConfiguration.js';
import { computeApprovalSourceHash } from '../shared/finance/ledger/approvalSourceHash.js';
import { buildPostingPlan } from '../shared/finance/ledger/postingPlan.js';
import { bookId } from '../shared/finance/ledger/certifiedPosting.js';
import { loadCertifiedBookReadModel } from '../server/vercel-handlers/finance/certifiedBookReadModel.js';
import { ledgerStateRef, stageCertifiedOpening, stageCertifiedPosting, stageCertifiedReversal, type LedgerCommandContext } from '../server/vercel-handlers/finance/certifiedLedgerStore.js';
import { executeWithIdempotency,hashPayload } from '../server/vercel-handlers/finance/idempotencyHelper.js';
import approveForPosting from '../server/vercel-handlers/finance/transactionsApproveForPosting.js';

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'))throw Error('An isolated demo Firestore Emulator is mandatory. Production access is forbidden.');
const {firestore:db}=getFirebaseAdmin(),suffix=randomBytes(8).toString('hex');
const org='synthetic_book_'+suffix,entity='synthetic_church_'+suffix;
const orgRef=db.collection('organizations').doc(org);
const c:LedgerCommandContext={db,organizationId:org,financeEntityId:entity,uid:'synthetic_actor',requestId:'synthetic_request_123'};
const configuration:CertifiedLedgerConfiguration={schemaVersion:1,enabled:true,version:1,firstPeriod:'2026-09',timeZone:'America/Sao_Paulo',currency:'BRL',dateBasis:'occurred_at',openingEquityAccountId:'equity',
  accounts:[{id:'bank_chart',name:'Bank',type:'asset',normalBalance:'debit',active:true,postingAllowed:true},{id:'income_chart',name:'Income',type:'income',normalBalance:'credit',active:true,postingAllowed:true},{id:'equity',name:'Opening equity',type:'equity',normalBalance:'credit',active:true,postingAllowed:true}],
  financeAccounts:[{accountId:'bank',ledgerAccountId:'bank_chart',type:'asset'}],categories:[{categoryId:'tithe',ledgerAccountId:'income_chart',kind:'income'}]};
const configRef=orgRef.collection('financeSettings').doc(ledgerConfigurationKey(entity));
const balanceRef=orgRef.collection('financeAggregates').doc('ledger_account_'+bookId(entity,'bank'));
async function command<T>(key:string,payload:unknown,fn:(t:Transaction)=>Promise<T>):Promise<T>{return executeWithIdempotency(db,orgRef.collection('financeIdempotency'),bookId(entity,key),hashPayload(payload),fn);}
async function seed(id:string,amount=10000,fund=false,alreadyApproved=true){
  const tx:any={id,organizationId:org,financeEntityId:entity,transactionKind:'income',cashFlowDirection:'inflow',status:'ready_for_review',amountCents:amount,currency:'BRL',occurredAt:'2026-09-20T12:00:00Z',recordedAt:'2026-10-01T12:00:00Z',accountId:'bank',evidenceIds:[],evidenceJustification:'Synthetic emulator fixture',paymentMethod:'pix',sourceContext:'manual',reconciliationStatus:'unreconciled',createdBy:'synthetic_creator',updatedBy:'synthetic_creator',version:1,contentVersion:1,schemaVersion:1};
  const allocation:any={id:'alloc_'+id,organizationId:org,financeEntityId:entity,transactionId:id,categoryId:'tithe',amountCents:amount,sequence:1,...(fund?{fundId:'mission'}:{})};
  tx.allocationIds=[allocation.id];
  const refs=certifiedPlanReferences(configuration,org,entity);
  const plan=buildPostingPlan({transaction:tx,allocations:[allocation],...refs,isPreview:true,approval:{approvedVersion:1,approvalSourceHash:'preview',status:'approved_for_posting',approvalAlgorithmVersion:3}});
  assert.deepEqual(plan.blockers,[]);
  const approval={status:'approved_for_posting',approvedVersion:1,approvedContentVersion:1,approvalAlgorithmVersion:3,approvalSourceHash:computeApprovalSourceHash(tx,[allocation],3),approvedPlanHash:plan.planHash,approvedReferenceFingerprintHash:refs.referenceFingerprintHash};
  if(alreadyApproved)Object.assign(tx,approval,{version:2});
  const ref=orgRef.collection('financeTransactions').doc(id);
  await ref.set(tx);if(alreadyApproved)await ref.collection('approvals').doc('latest').set(approval);
  await orgRef.collection('financeAllocations').doc(allocation.id).set(allocation);
  return ref;
}
async function main(){
  await orgRef.set({status:'active',name:'Synthetic church only'});
  await orgRef.collection('financeEntities').doc(entity).set({organizationId:org,active:true});
  await orgRef.collection('financeAccounts').doc('bank').set({organizationId:org,financeEntityId:entity,active:true,configurationStatus:'complete',nature:'asset',type:'bank_checking',openingBalanceRevision:1,openingBalanceDeclaration:{status:'pending_review',amountCents:50000,asOf:'2026-09-01',source:'prior_records',sourceNote:'Synthetic opening'}});
  await orgRef.collection('financeCategories').doc('tithe').set({organizationId:org,financeEntityId:entity,active:true,kind:'income'});
  await orgRef.collection('financeFunds').doc('mission').set({organizationId:org,financeEntityId:entity,active:true});
  await configRef.set({organizationId:org,financeEntityId:entity,configuration});
  const ref=await seed('tx_synthetic_a',10000,true);
  await assert.rejects(()=>command('no-opening',{},t=>stageCertifiedPosting(t,c,ref.id,2)),/LEDGER_ACCOUNT_OPENING_REQUIRED/);
  assert.equal((await orgRef.collection('financeJournalEntries').get()).size,0);
  const opening=await command('opening',{},t=>stageCertifiedOpening(t,c,'bank',1,'Verified synthetic opening for tests'));
  assert.ok(opening.journalEntryId);assert.equal((await balanceRef.get()).data()!.balanceCents,50000);
  assert.equal((await orgRef.collection('financeJournalEntries').get()).size,1);
  await assert.rejects(()=>command('duplicate-opening',{},t=>stageCertifiedOpening(t,c,'bank',1,'Do not duplicate certified opening')),/LEDGER_OPENING_ALREADY_CERTIFIED/);
  const posted=await command('post-a',{id:ref.id},t=>stageCertifiedPosting(t,c,ref.id,2));
  assert.equal(posted.status,'posted');assert.equal((await balanceRef.get()).data()!.balanceCents,60000);
  assert.deepEqual(await command('post-a',{id:ref.id},t=>stageCertifiedPosting(t,c,ref.id,2)),posted,'idempotent retry returns same receipt');
  await assert.rejects(()=>command('post-a',{id:'different'},t=>stageCertifiedPosting(t,c,ref.id,2)),/FINANCE_IDEMPOTENCY_CONFLICT/);
  const fundRef=orgRef.collection('financeAggregates').doc('ledger_fund_movement_'+bookId(entity,'mission'));
  assert.equal((await fundRef.get()).data()!.postedNetMovementCents,10000);
  const entryBefore=(await orgRef.collection('financeJournalEntries').doc(posted.journalEntryId).get()).data();
  const reversed=await command('reverse-a',{},t=>stageCertifiedReversal(t,c,ref.id,3,'2026-10-02','Synthetic duplicate receipt correction'));
  assert.equal(reversed.status,'reversed');assert.equal((await balanceRef.get()).data()!.balanceCents,50000);
  assert.equal((await fundRef.get()).data()!.postedNetMovementCents,0);
  assert.deepEqual((await orgRef.collection('financeJournalEntries').doc(posted.journalEntryId).get()).data(),entryBefore,'original journal remains immutable');
  await assert.rejects(()=>command('reverse-a-again',{},t=>stageCertifiedReversal(t,c,ref.id,4,'2026-10-03','Cannot reverse the same source twice')),/LEDGER_REVERSAL_STATE_INVALID/);
  const september=await db.runTransaction(t=>loadCertifiedBookReadModel(t,c,'2026-09-01','2026-10-01'));
  assert.equal(september.coverage.complete,true);assert.equal(september.coverage.entryCount,3);
  assert.equal(september.trialBalance.find(a=>a.accountId==='bank_chart')!.closingDebitNetCents,60000);
  const october=await db.runTransaction(t=>loadCertifiedBookReadModel(t,c,'2026-10-01','2026-11-01'));
  assert.equal(october.trialBalance.find(a=>a.accountId==='bank_chart')!.closingDebitNetCents,50000);
  const race=await seed('tx_synthetic_race',700);
  const raceResults=await Promise.allSettled(['race-a','race-b'].map(key=>command(key,{},t=>stageCertifiedPosting(t,c,race.id,2))));
  assert.equal(raceResults.filter(r=>r.status==='fulfilled').length,1,'two concurrent posts yield one effect');
  assert.equal((await balanceRef.get()).data()!.balanceCents,50700);
  const rollback=await seed('tx_synthetic_rollback',900);
  const revisionBefore=(await ledgerStateRef(db,org,entity).get()).data()!.revision;
  await assert.rejects(()=>command('rollback',{},async t=>{await stageCertifiedPosting(t,c,rollback.id,2);throw Error('synthetic failure before commit');}),/synthetic failure/);
  assert.equal((await rollback.get()).data()!.status,'approved_for_posting');
  assert.equal((await balanceRef.get()).data()!.balanceCents,50700);
  assert.equal((await ledgerStateRef(db,org,entity).get()).data()!.revision,revisionBefore);
  const stale=await seed('tx_synthetic_stale');await stale.update({amountCents:11000});
  await assert.rejects(()=>command('stale',{},t=>stageCertifiedPosting(t,c,stale.id,2)),/LEDGER_APPROVAL_SOURCE_CHANGED/);
  const catalog=await seed('tx_synthetic_catalog');await orgRef.collection('financeCategories').doc('tithe').update({active:false});
  await assert.rejects(()=>command('catalog',{},t=>stageCertifiedPosting(t,c,catalog.id,2)),/LEDGER_CATEGORY_UNAVAILABLE/);
  await orgRef.collection('financeCategories').doc('tithe').update({active:true});
  const foreign={...c,financeEntityId:'synthetic_other_church'};
  await assert.rejects(()=>command('foreign',{},t=>stageCertifiedPosting(t,foreign,catalog.id,2)),/LEDGER_SCOPE_INVALID/);
  await ledgerStateRef(db,org,entity).update({closedThrough:'2026-09'});
  await assert.rejects(()=>command('closed-month',{},t=>stageCertifiedPosting(t,c,catalog.id,2)),/LEDGER_PERIOD_CLOSED/);
  await ledgerStateRef(db,org,entity).update({closedThrough:null});
  // Exercise the existing HTTP approval handler and canonical resolver, rather
  // than testing only approvals assembled directly by a fixture.
  const approvalSource=await seed('tx_synthetic_real_approval',300,false,false);
  const {auth}=getFirebaseAdmin(),originalVerify=auth.verifyIdToken;
  await db.collection('users').doc(c.uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
  try {
    auth.verifyIdToken=async()=>({uid:c.uid,mn_app_id:'nestfinance',mn_handoff_version:1,mn_organization_id:org,mn_session_version:1}) as any;
    const response:any={statusCode:200,body:null,status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;return this;},setHeader(){return this;}};
    await approveForPosting({method:'POST',query:{},headers:{authorization:'Bearer synthetic-emulator-token','x-organization-id':org,'content-type':'application/json'},body:{financeEntityId:entity,transactionId:approvalSource.id,expectedVersion:1,approvalIdempotencyKey:'synthetic_actual_approval_key',requestId:'synthetic_actual_approval_request'}} as any,response);
    assert.equal(response.statusCode,200,JSON.stringify(response.body));
    const approved=(await approvalSource.get()).data()!;
    assert.equal(approved.approvalAlgorithmVersion,3);
    assert.equal(approved.status,'approved_for_posting');
    assert.equal(approved.version,2);
    const realPosted=await command('actual-approved-post',{},t=>stageCertifiedPosting(t,c,approvalSource.id,2));
    assert.equal(realPosted.status,'posted','actual approval seal must survive its workflow version increment');
    assert.equal((await balanceRef.get()).data()!.balanceCents,51000);
  } finally {auth.verifyIdToken=originalVerify;}
  const final=await db.runTransaction(t=>loadCertifiedBookReadModel(t,c,'2026-09-01','2026-11-01'));
  assert.equal(final.coverage.entryCount,5);
  await ledgerStateRef(db,org,entity).update({entryCount:6});
  await assert.rejects(()=>db.runTransaction(t=>loadCertifiedBookReadModel(t,c,'2026-09-01','2026-11-01')),/LEDGER_REPORT_COVERAGE_INCOMPLETE/);
  console.log('Certified book real Firestore Emulator passed: actual HTTP approval-v3 seal to post, opening, post/reversal, atomic fund movements, exact report coverage, idempotency, concurrent double post, forced rollback, stale approval, inactive catalog, cross-entity and period lock. No production data or browser authentication.');
}
main().catch(error=>{console.error('Certified book Emulator failed',error);process.exitCode=1});
