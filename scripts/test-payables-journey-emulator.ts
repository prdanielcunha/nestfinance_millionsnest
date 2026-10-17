import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin,resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import createPayable from '../server/vercel-handlers/finance/payablesCreate.js';
import listPayables from '../server/vercel-handlers/finance/payablesList.js';
import { parsePayableDraft } from '../shared/finance/payableObligation.js';
if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.includes('emulator'))
  throw Error('Isolated Firestore emulator required for payables');

class Res{
  statusCode=200;body:any=null; headers:Record<string,string>={};
  setHeader(k:string,v:string){this.headers[k]=v;return this;}
  status(c:number){this.statusCode=c;return this;}
  json(d:any){this.body=d;return this;}
}
async function run(){
  resetFirebaseAdminForTests();
  const admin=getFirebaseAdmin(),db=admin.firestore;
  const random=randomBytes(8).toString('hex');
  const org='org_payables_'+random,entity='entity_payables_'+random,otherEntity='entity_other_'+random;
  const uid='uid_payables_ceo_'+random;
  const orgRef=db.collection('organizations').doc(org);
  const previous=process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED;
  const originalVerify=admin.auth.verifyIdToken;
  await orgRef.set({name:'Synthetic entity',status:'active'});
  await db.collection('users').doc(uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
  await orgRef.collection('financeEntities').doc(entity).set({organizationId:org,name:'Church A',active:true});
  await orgRef.collection('financeEntities').doc(otherEntity).set({organizationId:org,name:'Church B',active:true});
  admin.auth.verifyIdToken=async()=>({
    uid,mn_app_id:'nestfinance',mn_handoff_version:1,mn_organization_id:org,mn_session_version:1,
  }) as any;
  const data={description:'Electricity bill October',counterparty:'Power utility',
    amountCents:17855,dueDate:'2026-10-29',documentReference:'invoice-2026-10'};
  const key='synthetic_payables_emulator_idempotency_001';
  async function call(handler:any,body:any,headerOrg=org){
    const req:any={method:'POST',headers:{authorization:'Bearer fake-emulator',
      'content-type':'application/json','x-organization-id':headerOrg},body,query:{}};
    const res=new Res();await handler(req,res as any);return res;
  }
  try{
    delete process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED;
    const off=await call(createPayable,{financeEntityId:entity,payload:data,idempotencyKey:key,requestId:'request_0001'});
    assert.equal(off.statusCode,503,'disabled by default');
    process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED='true';

    assert.throws(()=>parsePayableDraft({...data,dueDate:'2026-02-30'}));
    assert.throws(()=>parsePayableDraft({...data,amountCents:0}));
    assert.throws(()=>parsePayableDraft({...data,paidCents:1}),undefined,'client cannot set paid value');
    assert.throws(()=>parsePayableDraft({...data,status:'settled'}),undefined,'client cannot claim a payment');
    assert.throws(()=>parsePayableDraft({...data,amountCents:2.2}));

    const invalid=await call(createPayable,{financeEntityId:entity,payload:{...data,paidCents:17855},
      idempotencyKey:'invalid-payable-data-1',requestId:'request_0002'});
    assert.equal(invalid.statusCode,400);
    const create=await call(createPayable,{financeEntityId:entity,payload:data,idempotencyKey:key,requestId:'request_0003'});
    assert.equal(create.statusCode,201,JSON.stringify(create.body));
    assert.equal(create.body.status,'awaiting_review');
    assert.equal(create.body.postingPerformed,false);
    const payableRef=orgRef.collection('financeEntities').doc(entity).collection('financePayables').doc(create.body.id);
    const saved=(await payableRef.get()).data()!;
    assert.equal(saved.amountCents,17855);
    assert.equal(saved.dueDate,'2026-10-29');
    assert.equal(saved.status,'awaiting_review');
    assert.equal(saved.remainingCents,17855);
    assert.equal(saved.paidCents,0);
    assert.equal(saved.postingPerformed,false);
    assert.equal(saved.version,1);

    const retry=await call(createPayable,{financeEntityId:entity,payload:data,idempotencyKey:key,requestId:'request_0004'});
    assert.equal(retry.statusCode,201);
    assert.deepEqual(retry.body,create.body,'retry must not duplicate payable');
    const conflict=await call(createPayable,{financeEntityId:entity,payload:{...data,amountCents:20000},idempotencyKey:key,requestId:'request_0005'});
    assert.equal(conflict.statusCode,409);

    const read=await call(listPayables,{financeEntityId:entity});
    assert.equal(read.statusCode,200,JSON.stringify(read.body));
    assert.equal(read.body.items.length,1);
    assert.equal(read.body.items[0].id,create.body.id);
    assert.equal(read.body.items[0].remainingCents,17855);
    assert.equal(read.body.postingPerformed,false);
    assert.ok(!JSON.stringify(read.body).includes(uid),'never expose actor UID');

    const other=await call(listPayables,{financeEntityId:otherEntity});
    assert.equal(other.statusCode,200);
    assert.deepEqual(other.body.items,[],'no bills from a sibling entity');
    const wrongHeader=await call(listPayables,{financeEntityId:entity},'org_bogus_other');
    assert.equal(wrongHeader.statusCode,403,'handoff token cannot be retargeted to another org');

    const invalidCursor=await call(listPayables,{financeEntityId:entity,afterId:'../../other'});
    assert.equal(invalidCursor.statusCode,400);
    const errorUnknown=await call(listPayables,{financeEntityId:entity,unknown:'private'});
    assert.equal(errorUnknown.statusCode,400);

    // Populate synthetic records strictly through admin to prove no silent
    // 25-item truncation and stable keyset pagination.
    const batch=db.batch();
    for(let i=0;i<29;i++){
      const id='pay_'+String(i).padStart(32,'0');
      batch.create(orgRef.collection('financeEntities').doc(entity).collection('financePayables').doc(id),{
        ...saved,organizationId:org,financeEntityId:entity,description:'Synthetic account '+i,
      });
    }
    await batch.commit();
    const page1=await call(listPayables,{financeEntityId:entity});
    assert.equal(page1.statusCode,200);
    assert.equal(page1.body.items.length,25);
    assert.equal(page1.body.hasMore,true);
    assert.ok(page1.body.nextCursor);
    const page2=await call(listPayables,{financeEntityId:entity,afterId:page1.body.nextCursor});
    assert.equal(page2.statusCode,200);
    assert.equal(page2.body.items.length,5);
    assert.equal(page2.body.hasMore,false);
    assert.equal(new Set([...page1.body.items,...page2.body.items].map((x:any)=>x.id)).size,30);

    const audits=(await orgRef.collection('financeAuditLogs').get()).docs.map(d=>d.data());
    assert.equal(audits.filter(x=>x.action==='finance.payable.draft_created').length,1);
    assert.equal((await orgRef.collection('financeTransactions').get()).size,0);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size,0);
    assert.equal((await orgRef.collection('financeJournalLines').get()).size,0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size,0);
    console.log('✅ T18/T19 payables E2E: OFF default, create+audit, retries, tenant guard, safe pagination, no posting');
  }finally{
    admin.auth.verifyIdToken=originalVerify;
    if(previous===undefined)delete process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED;
    else process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED=previous;
  }
}
run().catch(error=>{console.error('Payables E2E failed',error);process.exitCode=1;});
