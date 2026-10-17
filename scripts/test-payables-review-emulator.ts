import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin,resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import createPayable from '../server/vercel-handlers/finance/payablesCreate.js';
import listPayables from '../server/vercel-handlers/finance/payablesList.js';
import reviewPayable from '../server/vercel-handlers/finance/payablesReview.js';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_PROJECT_ID?.includes('emulator'))
  throw Error('An isolated Firestore emulator is mandatory');

class Res {
  statusCode=200; body:any=null; headers:Record<string,string>={};
  setHeader(k:string,v:string){this.headers[k]=v;return this;}
  status(c:number){this.statusCode=c;return this;}
  json(b:any){this.body=b;return this;}
}
async function run(){
  resetFirebaseAdminForTests();
  const {firestore:db,auth}=getFirebaseAdmin();
  const suffix=randomBytes(7).toString('hex');
  const org='org_review_bill_'+suffix;
  const entity='entity_review_bill_'+suffix;
  const otherEntity='entity_other_bill_'+suffix;
  const uid='ceo_review_bill_'+suffix;
  const orgRef=db.collection('organizations').doc(org);
  const originalVerify=auth.verifyIdToken;
  const oldCreate=process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED;
  const oldReview=process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED;
  try{
    await orgRef.set({status:'active',name:'Synthetic church'});
    await db.collection('users').doc(uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
    await orgRef.collection('financeEntities').doc(entity).set({organizationId:org,active:true,name:'Church 1'});
    await orgRef.collection('financeEntities').doc(otherEntity).set({organizationId:org,active:true,name:'Church 2'});
    auth.verifyIdToken=async()=>({
      uid,mn_app_id:'nestfinance',mn_handoff_version:1,
      mn_organization_id:org,mn_session_version:1,
    }) as any;
    async function call(handler:any,body:any,headerOrg=org){
      const req:any={method:'POST',body,query:{},headers:{
        authorization:'Bearer synthetic-emulator-token',
        'content-type':'application/json',
        'x-organization-id':headerOrg,
      }};
      const res=new Res();
      await handler(req,res as any);
      return res;
    }
    process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED='true';
    delete process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED;
    const data={description:'October power bill',counterparty:'Power utility',
      amountCents:17950,dueDate:'2026-10-29'};
    const created=await call(createPayable,{financeEntityId:entity,payload:data,
      idempotencyKey:'synthetic_create_review_bill_123456789',requestId:'review-create-1'});
    assert.equal(created.statusCode,201,JSON.stringify(created.body));
    const id=created.body.id;
    const reviewPayload={financeEntityId:entity,payableId:id,expectedVersion:1,
      idempotencyKey:'synthetic_review_bill_123456789',requestId:'review-request-1'};
    const off=await call(reviewPayable,reviewPayload);
    assert.equal(off.statusCode,503,'human review off by default');
    const offList=await call(listPayables,{financeEntityId:entity});
    assert.equal(offList.statusCode,200);
    assert.equal(offList.body.reviewEnabled,false);

    process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED='true';
    const invalid=await call(reviewPayable,{...reviewPayload,payableId:'../../bad'});
    assert.equal(invalid.statusCode,400);
    const foreign=await call(reviewPayable,{...reviewPayload,financeEntityId:otherEntity});
    assert.equal(foreign.statusCode,404,'cannot review a different church payable');
    const wrongOrg=await call(reviewPayable,reviewPayload,'wrong-org');
    assert.equal(wrongOrg.statusCode,403,'cannot retarget signed org');
    const initial=await call(listPayables,{financeEntityId:entity});
    assert.equal(initial.body.reviewEnabled,true);
    assert.equal(initial.body.items[0].status,'awaiting_review');

    const accepted=await call(reviewPayable,reviewPayload);
    assert.equal(accepted.statusCode,200,JSON.stringify(accepted.body));
    assert.deepEqual(accepted.body,{
      id,status:'open',version:2,remainingCents:17950,paidCents:0,postingPerformed:false,
    });
    const retry=await call(reviewPayable,{...reviewPayload,requestId:'review-request-2'});
    assert.equal(retry.statusCode,200);
    assert.deepEqual(retry.body,accepted.body,'same key must not duplicate review');
    const changedKey=await call(reviewPayable,{...reviewPayload,idempotencyKey:'new-review-after-complete-12345'});
    assert.equal(changedKey.statusCode,409,'reviewed status blocks second approval');
    const changedVersion=await call(reviewPayable,{...reviewPayload,expectedVersion:2,
      idempotencyKey:'review-version-2-123456789'});
    assert.equal(changedVersion.statusCode,409,'status must block even with current version');

    const stored=await orgRef.collection('financeEntities').doc(entity)
      .collection('financePayables').doc(id).get();
    assert.equal(stored.data()?.status,'open');
    assert.equal(stored.data()?.version,2);
    assert.equal(stored.data()?.paidCents,0);
    assert.equal(stored.data()?.remainingCents,17950);
    assert.ok(stored.data()?.reviewedByUid);
    assert.ok(stored.data()?.reviewedAt);
    assert.equal(stored.data()?.postingPerformed,false);
    const final=await call(listPayables,{financeEntityId:entity});
    assert.equal(final.body.items[0].status,'open');
    assert.ok(!JSON.stringify(final.body).includes(uid),'reviewer UID stays server-side');

    const audits=(await orgRef.collection('financeAuditLogs').get()).docs.map(d=>d.data());
    assert.equal(audits.filter(x=>x.action==='finance.payable.reviewed_unpaid').length,1);
    for(const collection of ['financeTransactions','financeJournalEntries',
      'financeJournalLines','financeAggregates','financeAccountEffects']){
      assert.equal((await orgRef.collection(collection).get()).size,0,
        'review must never post or update balances: '+collection);
    }
    console.log('✅ Human payable review: OFF default, tenant denial, idempotent approval, version/status conflict, one audit, no posting');
  }finally{
    auth.verifyIdToken=originalVerify;
    if(oldCreate===undefined)delete process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED;
    else process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED=oldCreate;
    if(oldReview===undefined)delete process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED;
    else process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED=oldReview;
  }
}
run().catch(e=>{console.error('Payables review E2E failed',e);process.exitCode=1});
