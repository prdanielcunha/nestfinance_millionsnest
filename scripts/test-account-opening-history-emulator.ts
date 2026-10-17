import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin,resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import openingHistory from '../server/vercel-handlers/finance/accountsOpeningHistory.js';

/** Real Firestore Emulator test with synthetic tenancy and isolated finance-only data. */
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.includes('emulator')) {
  throw Error('Isolated Firestore emulator required for opening provenance integration');
}
class MockRes {
  statusCode=200; body:any=null; headers:Record<string,string>={};
  setHeader(name:string,value:string){this.headers[name]=value;return this;}
  status(code:number){this.statusCode=code;return this;}
  json(body:any){this.body=body;return this;}
}
async function run(){
  resetFirebaseAdminForTests();
  const admin=getFirebaseAdmin(),db=admin.firestore;
  const suffix=randomBytes(8).toString('hex');
  const org='org_opening_hist_'+suffix,entity='entity_opening_'+suffix,otherEntity='entity_other_'+suffix;
  const uid='ceo_opening_'+suffix,unauthorized='count_only_'+suffix;
  const accountId='acc_'+randomBytes(16).toString('hex');
  const foreignId='acc_'+randomBytes(16).toString('hex');
  const orgRef=db.collection('organizations').doc(org),accountRef=orgRef.collection('financeAccounts').doc(accountId);
  const originalVerify=admin.auth.verifyIdToken;
  await orgRef.set({status:'active',name:'Synthetic opening organization'});
  await db.collection('users').doc(uid).set({displayName:'Synthetic Reviewer',systemRole:'ceo',ecosystemSessionVersion:1});
  await db.collection('users').doc(unauthorized).set({displayName:'Synthetic Count-only',ecosystemSessionVersion:1});
  await orgRef.collection('financeEntities').doc(entity).set({name:'Synthetic Church A',active:true});
  await orgRef.collection('financeEntities').doc(otherEntity).set({name:'Synthetic Church B',active:true});
  await accountRef.set({organizationId:org,financeEntityId:entity,name:'Synthetic cashbox',
    openingBalanceRevision:28,openingBalanceDeclaration:{status:'pending_review',amountCents:2800}});
  await orgRef.collection('financeAccounts').doc(foreignId).set({
    organizationId:org,financeEntityId:otherEntity,name:'Foreign Church Cashbox',
  });
  const batch=db.batch();
  for(let revision=1;revision<=28;revision++){
    batch.set(accountRef.collection('openingBalanceHistory').doc('v_'+String(revision).padStart(3,'0')),{
      organizationId:org,financeEntityId:entity,accountId,revision,
      previous:revision===1?null:{status:'pending_review',amountCents:(revision-1)*100,asOf:'2026-10-10',source:'cash_count'},
      current:{status:'pending_review',amountCents:revision*100,asOf:'2026-10-10',source:'cash_count'},
      reason:revision===1?'initial_account_creation':'Synthetic treasury reassessment',actorUid:uid,
      createdAt:new Date('2026-10-16T13:00:00Z'),schemaVersion:1,
    });
  }
  await batch.commit();
  let actor=uid;
  admin.auth.verifyIdToken=async()=>({
    uid:actor,mn_app_id:'nestfinance',mn_handoff_version:1,
    mn_organization_id:org,mn_session_version:1,
  }) as any;
  async function call(payload:Record<string,unknown>,authorization=true) {
    const req:any={method:'POST',headers:{
      'content-type':'application/json',
      ...(authorization?{authorization:'Bearer synthetic-emulator-token'}:{}),
      'x-organization-id':org,
    },body:payload,query:{}};
    const res=new MockRes();await openingHistory(req,res as any);return res;
  }
  try{
    const first=await call({financeEntityId:entity,accountId});
    assert.equal(first.statusCode,200,JSON.stringify(first.body));
    assert.equal(first.body.items.length,25);
    assert.equal(first.body.items[0].revision,28);
    assert.equal(first.body.items[24].revision,4);
    assert.equal(first.body.nextCursor,4);
    assert.equal(first.body.hasMore,true);
    assert.equal(first.body.postingPerformed,false);
    assert.equal(first.headers['Cache-Control'],'private, no-store, max-age=0');
    assert.equal(JSON.stringify(first.body).includes(uid),false,'actor UID must never leak');
    const last=await call({financeEntityId:entity,accountId,beforeRevision:first.body.nextCursor});
    assert.equal(last.statusCode,200,JSON.stringify(last.body));
    assert.deepEqual(last.body.items.map((item:any)=>item.revision),[3,2,1]);
    assert.equal(last.body.hasMore,false);
    assert.equal(last.body.nextCursor,null);
    const all=[...first.body.items,...last.body.items];
    assert.equal(new Set(all.map((item:any)=>item.revision)).size,28,'no dropped or duplicated pages');
    const cross=await call({financeEntityId:entity,accountId:foreignId});
    assert.equal(cross.statusCode,403,JSON.stringify(cross.body));
    const missing=await call({financeEntityId:entity,accountId:'acc_'+randomBytes(16).toString('hex')});
    assert.equal(missing.statusCode,404);
    const badCursor=await call({financeEntityId:entity,accountId,beforeRevision:-1});
    assert.equal(badCursor.statusCode,400);
    const badId=await call({financeEntityId:entity,accountId:'../../other'});
    assert.equal(badId.statusCode,400);
    actor=unauthorized;
    const forbidden=await call({financeEntityId:entity,accountId});
    assert.equal(forbidden.statusCode,403,JSON.stringify(forbidden.body));
    actor=uid;
    const unauth=await call({financeEntityId:entity,accountId},false);
    assert.equal(unauth.statusCode,401);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size,0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size,0);
    assert.equal((await accountRef.collection('openingBalanceHistory').get()).size,28);
    console.log('✅ Opening history emulator: 28 revisions, complete paging, cross-entity deny, RBAC, no UID exposure and no posting');
  }finally{admin.auth.verifyIdToken=originalVerify;}
}
run().catch(err=>{console.error('Opening history E2E failed',err);process.exitCode=1;});
