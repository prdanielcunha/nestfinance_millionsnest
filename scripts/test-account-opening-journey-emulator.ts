import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin,resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import createAccount from '../server/vercel-handlers/finance/accountsCreate.js';
import updateAccount from '../server/vercel-handlers/finance/accountsUpdate.js';
import readHistory from '../server/vercel-handlers/finance/accountsOpeningHistory.js';

/** Synthetic end-to-end opening balance journey, never point to a live Firebase project. */
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.includes('emulator')) {
  throw Error('Opening account journey requires an isolated Firestore emulator');
}
class MockRes {
  statusCode=200; body:any=null; headers:Record<string,string>={};
  setHeader(name:string,value:string){this.headers[name]=value;return this;}
  status(statusCode:number){this.statusCode=statusCode;return this;}
  json(body:any){this.body=body;return this;}
}
async function run(){
  resetFirebaseAdminForTests();
  const admin=getFirebaseAdmin(),db=admin.firestore;
  const org='org_opening_journey_'+randomBytes(8).toString('hex');
  const entity='entity_opening_journey_'+randomBytes(8).toString('hex');
  const otherEntity='entity_opening_other_'+randomBytes(8).toString('hex');
  const uid='ceo_opening_journey_'+randomBytes(8).toString('hex');
  const orgRef=db.collection('organizations').doc(org);
  await orgRef.set({name:'Synthetic church test',status:'active'});
  await db.collection('users').doc(uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
  await orgRef.collection('financeEntities').doc(entity).set({name:'Entity A',active:true});
  await orgRef.collection('financeEntities').doc(otherEntity).set({name:'Entity B',active:true});
  const originalVerify=admin.auth.verifyIdToken;
  const originalFlag=process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED;
  admin.auth.verifyIdToken=async()=>({
    uid,mn_app_id:'nestfinance',mn_handoff_version:1,
    mn_organization_id:org,mn_session_version:1,
  }) as any;
  async function call(handler:any,body:Record<string,unknown>){
    const req:any={method:'POST',headers:{
      authorization:'Bearer synthetic-emulator-token',
      'content-type':'application/json',
      'x-organization-id':org,
    },body,query:{}};
    const res=new MockRes();await handler(req,res as any);return res;
  }
  const name='Synthetic cash '+randomBytes(4).toString('hex');
  const initial={status:'declared',amountCents:10000,asOf:'2026-10-10',source:'cash_count'};
  try {
    delete process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED;
    const disabled=await call(createAccount,{name,type:'cash',financeEntityId:entity,openingBalanceDeclaration:initial});
    assert.equal(disabled.statusCode,503,'default flag must block all account writes');
    process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED='true';
    const invalid=await call(createAccount,{
      name:'Invalid opening',type:'cash',financeEntityId:entity,
      openingBalanceDeclaration:{...initial,asOf:'2026-02-30'},
    });
    assert.equal(invalid.statusCode,400);
    const created=await call(createAccount,{name,type:'cash',financeEntityId:entity,openingBalanceDeclaration:initial});
    assert.equal(created.statusCode,201,JSON.stringify(created.body));
    const accountId=created.body.id as string;
    const accountRef=orgRef.collection('financeAccounts').doc(accountId);
    let account=(await accountRef.get()).data() || {};
    assert.equal(account.openingBalanceRevision,1);
    assert.equal(account.openingBalanceDeclaration.status,'pending_review');
    assert.equal(account.openingBalanceDeclaration.amountCents,10000);
    assert.equal(account.openingBalanceDeclaration.asOf,'2026-10-10');
    assert.equal(account.openingBalanceCents,undefined,'declared opening must not become posted balance');
    let history=await accountRef.collection('openingBalanceHistory').get();
    assert.equal(history.size,1);
    assert.equal(history.docs[0].data().current.amountCents,10000);
    const replay=await call(createAccount,{name,type:'cash',financeEntityId:entity,openingBalanceDeclaration:initial});
    assert.equal(replay.statusCode,409,'name uniqueness must protect duplicate accounts');
    const updateInput=(amountCents:number,revision:number,financeEntityId=entity)=>({
      accountId,name,financeEntityId,expectedOpeningBalanceRevision:revision,
      openingBalanceReason:'Conferência assinada da tesouraria',
      openingBalanceDeclaration:{status:'declared',amountCents,asOf:'2026-10-10',source:'cash_count'},
    });
    const otherEntityAttempt=await call(updateAccount,updateInput(11100,1,otherEntity));
    assert.notEqual(otherEntityAttempt.statusCode,200,'cannot alter an account under another entity');
    const invalidReason=await call(updateAccount,{
      ...updateInput(12500,1),openingBalanceReason:'curto',
    });
    assert.equal(invalidReason.statusCode,400);
    const [r1,r2]=await Promise.all([
      call(updateAccount,updateInput(12500,1)),
      call(updateAccount,updateInput(12900,1)),
    ]);
    assert.deepEqual([r1.statusCode,r2.statusCode].sort((a,b)=>a-b),[200,409],
      'concurrent reviewers must not silently overwrite one another');
    account=(await accountRef.get()).data() || {};
    assert.equal(account.openingBalanceRevision,2);
    assert.ok([12500,12900].includes(account.openingBalanceDeclaration.amountCents));
    history=await accountRef.collection('openingBalanceHistory').get();
    assert.equal(history.size,2,'exactly one correction history entry');
    const savedAmount=account.openingBalanceDeclaration.amountCents as number;
    const repeat=await call(updateAccount,updateInput(savedAmount,2));
    assert.equal(repeat.statusCode,200,JSON.stringify(repeat.body));
    assert.equal(repeat.body.changed,false);
    assert.equal((await accountRef.collection('openingBalanceHistory').get()).size,2,
      'repeat unchanged mapping cannot create spurious corrections');
    const stale=await call(updateAccount,updateInput(11111,1));
    assert.equal(stale.statusCode,409);
    assert.equal(stale.body.error,'OPENING_BALANCE_VERSION_CONFLICT');
    const read=await call(readHistory,{financeEntityId:entity,accountId});
    assert.equal(read.statusCode,200,JSON.stringify(read.body));
    assert.deepEqual(read.body.items.map((i:any)=>i.revision),[2,1]);
    assert.equal(read.body.hasMore,false);
    assert.equal(read.body.postingPerformed,false);
    const legacyId='acc_'+randomBytes(16).toString('hex');
    await orgRef.collection('financeAccounts').doc(legacyId).set({
      organizationId:org,financeEntityId:entity,name:'Synthetic legacy',normalizedName:'synthetic legacy',
      type:'cash',currency:'BRL',active:true,openingBalanceCents:20000,
    });
    const legacy=await call(updateAccount,{
      ...updateInput(100,0),accountId:legacyId,name:'Synthetic legacy',
    });
    assert.equal(legacy.statusCode,409,JSON.stringify(legacy.body));
    assert.equal(legacy.body.error,'OPENING_BALANCE_LEGACY_RECONCILIATION_REQUIRED');
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size,0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size,0);
    assert.equal((await orgRef.collection('financeAllocations').get()).size,0);
    assert.equal((await orgRef.collection('financeTransactions').get()).size,0);
    console.log('✅ P0A opening E2E: disabled-by-default, validated source, unique account, concurrent revision, append-only history, legacy guard, tenant isolation, no posting');
  } finally {
    admin.auth.verifyIdToken=originalVerify;
    if(originalFlag===undefined)delete process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED;
    else process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED=originalFlag;
  }
}
run().catch(e=>{console.error('P0A opening journey emulator failure',e);process.exitCode=1;});
