import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin,resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import createDraft from '../server/vercel-handlers/finance/payablesCreateDraft.js';
import listDrafts from '../server/vercel-handlers/finance/payablesList.js';

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_PROJECT_ID?.includes('emulator')){
  throw Error('An isolated Firestore emulator is required for payable drafts E2E');
}
class MockRes{
  statusCode=200;body:any=null;headers:Record<string,string>={};
  setHeader(k:string,v:string){this.headers[k]=v;return this;}
  status(v:number){this.statusCode=v;return this;}
  json(v:any){this.body=v;return this;}
}
async function test(){
  const beforeFlag=process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED;
  process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED='true';
  resetFirebaseAdminForTests();
  const admin=getFirebaseAdmin(),db=admin.firestore;
  const rnd=()=>randomBytes(8).toString('hex');
  const org='org_payable_'+rnd(),org2='org_payable_elsewhere_'+rnd();
  const entity='fent_'+randomBytes(16).toString('hex');
  const otherEntity='fent_'+randomBytes(16).toString('hex');
  const uid='admin_payable_'+rnd(),otherUser='no_roles_'+rnd();
  const category='cat_'+randomBytes(16).toString('hex');
  const foreignCategory='cat_'+randomBytes(16).toString('hex');
  const orgRef=db.collection('organizations').doc(org);
  const originalVerify=admin.auth.verifyIdToken;
  let actor=uid,headerOrg=org;
  try{
    await orgRef.set({name:'Synthetic Church Ledger',status:'active'});
    await db.collection('organizations').doc(org2).set({name:'Another Church',status:'active'});
    await db.collection('users').doc(uid).set({systemRole:'ceo',displayName:'Finance Admin',ecosystemSessionVersion:1});
    await db.collection('users').doc(otherUser).set({displayName:'Unauthorized',ecosystemSessionVersion:1});
    await orgRef.collection('financeEntities').doc(entity).set({name:'Church A',active:true,financeEntityId:entity,organizationId:org});
    await orgRef.collection('financeEntities').doc(otherEntity).set({name:'Church B',active:true,financeEntityId:otherEntity,organizationId:org});
    await orgRef.collection('financeCategories').doc(category).set({
      organizationId:org,financeEntityId:entity,name:'Utility bills',kind:'expense',active:true,
    });
    await orgRef.collection('financeCategories').doc(foreignCategory).set({
      organizationId:org,financeEntityId:otherEntity,name:'Another church expense',kind:'expense',active:true,
    });
    admin.auth.verifyIdToken=async()=>({
      uid:actor,mn_app_id:'nestfinance',mn_handoff_version:1,
      mn_organization_id:org,mn_session_version:1,
    }) as any;
    async function invoke(handler:any,payload:Record<string,unknown>){
      const req:any={method:'POST',query:{},body:payload,headers:{
        authorization:'Bearer synthetic-emulator-token',
        'x-organization-id':headerOrg,
        'content-type':'application/json',
      }};
      const res=new MockRes();
      await handler(req,res as any);
      return res;
    }
    const draft={description:'Conta de água do mês',amountCents:18765,
      dueDate:'2026-10-24',competenceDate:'2026-10-01',
      payeeName:'Companhia de água',categoryId:category};
    const k='idem_payable_'+rnd(),requestId='req_payable_'+rnd();
    const args={financeEntityId:entity,draft,idempotencyKey:k,requestId};

    const created=await invoke(createDraft,args);
    assert.equal(created.statusCode,201,JSON.stringify(created.body));
    assert.equal(created.body.status,'draft');
    assert.equal(created.body.financialPostingPerformed,false);
    const payableId=created.body.payableId;
    assert.match(payableId,/^obl_[a-f0-9]{32}$/);
    const payableRef=orgRef.collection('financeObligations').doc(payableId);
    const snap=await payableRef.get();
    assert.equal(snap.data()?.financeEntityId,entity);
    assert.equal(snap.data()?.amountCents,18765);
    assert.equal(snap.data()?.amountPaidCents,0);
    assert.equal(snap.data()?.outstandingCents,18765);
    assert.equal(snap.data()?.status,'draft');

    const retry=await invoke(createDraft,args);
    assert.equal(retry.statusCode,201,JSON.stringify(retry.body));
    assert.equal(retry.body.payableId,payableId);
    const conflict=await invoke(createDraft,{...args,draft:{...draft,amountCents:1234}});
    assert.equal(conflict.statusCode,409,JSON.stringify(conflict.body));
    assert.equal(conflict.body.error,'PAYABLE_IDEMPOTENCY_CONFLICT');
    const invalid=await invoke(createDraft,{...args,idempotencyKey:'idem_'+rnd(),
      draft:{...draft,dueDate:'2026-02-30'}});
    assert.equal(invalid.statusCode,400);
    const categoryCross=await invoke(createDraft,{...args,idempotencyKey:'idem_'+rnd(),
      draft:{...draft,categoryId:foreignCategory}});
    assert.equal(categoryCross.statusCode,400,JSON.stringify(categoryCross.body));

    const beforeDocs=(await orgRef.collection('financeObligations').get()).size;
    actor=otherUser;
    const unauth=await invoke(createDraft,{...args,idempotencyKey:'idem_'+rnd()});
    assert.equal(unauth.statusCode,403,JSON.stringify(unauth.body));
    actor=uid;
    headerOrg=org2;
    const crossTenant=await invoke(createDraft,{...args,idempotencyKey:'idem_'+rnd()});
    assert.equal(crossTenant.statusCode,403,JSON.stringify(crossTenant.body));
    headerOrg=org;
    assert.equal((await orgRef.collection('financeObligations').get()).size,beforeDocs);

    // Additional synthetic payables permit a real 25+ item list pagination.
    const batch=db.batch();
    for(let i=0;i<27;i++){
      const id='obl_'+randomBytes(16).toString('hex');
      batch.set(orgRef.collection('financeObligations').doc(id),{
        id,organizationId:org,financeEntityId:entity,description:'Synthetic due bill '+i,
        amountCents:100+i,amountPaidCents:0,outstandingCents:100+i,currency:'BRL',
        dueDate:'2026-10-'+String((i%25)+1).padStart(2,'0'),
        status:'draft',version:1,financialPostingPerformed:false,
      });
    }
    await batch.commit();
    // Foreign-entity document must never enter this church's results.
    await orgRef.collection('financeObligations').doc('obl_'+randomBytes(16).toString('hex')).set({
      organizationId:org,financeEntityId:otherEntity,description:'Other church',
      amountCents:999,amountPaidCents:0,outstandingCents:999,currency:'BRL',
      dueDate:'2026-10-01',status:'draft',version:1,
    });
    const first=await invoke(listDrafts,{financeEntityId:entity});
    assert.equal(first.statusCode,200,JSON.stringify(first.body));
    assert.equal(first.body.items.length,25);
    assert.equal(first.body.hasMore,true);
    assert.ok(first.body.nextCursor);
    const second=await invoke(listDrafts,{financeEntityId:entity,...first.body.nextCursor});
    assert.equal(second.statusCode,200,JSON.stringify(second.body));
    assert.equal(second.body.items.length,3);
    assert.equal(second.body.hasMore,false);
    assert.deepEqual(second.body.nextCursor,null);
    const items=[...first.body.items,...second.body.items];
    assert.equal(new Set(items.map((x:any)=>x.id)).size,28);
    assert.ok(items.every((x:any)=>x.status==='draft'&&x.financialPostingPerformed===false));
    assert.ok(items.every((x:any)=>x.description!=='Other church'));
    assert.ok(items.every((x:any,i:number)=>i===0||items[i-1].dueDate<=x.dueDate));
    const invalidCursor=await invoke(listDrafts,{financeEntityId:entity,afterDueDate:'2026-99-99',afterId:'bad'});
    assert.equal(invalidCursor.statusCode,400);

    assert.equal((await orgRef.collection('financeTransactions').get()).size,0);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size,0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size,0);
    const audits=(await orgRef.collection('financeAuditLogs').get()).docs.map(d=>d.data());
    assert.ok(audits.some(a=>a.entityId===payableId&&a.action==='finance.obligation_draft_created'));
    process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED='false';
    const disabled=await invoke(createDraft,{...args,idempotencyKey:'idem_'+rnd()});
    assert.equal(disabled.statusCode,503);
    console.log('✅ T18/T19 emulator: unpaid bill draft, 28 paginated records, idempotency, audit, cross-org/entity, strict no posting');
  }finally{
    admin.auth.verifyIdToken=originalVerify;
    if(beforeFlag===undefined)delete process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED;
    else process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED=beforeFlag;
  }
}
test().catch(e=>{console.error('Payable E2E failure',e);process.exitCode=1;});
