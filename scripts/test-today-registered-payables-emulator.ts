import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {getFirebaseAdmin,resetFirebaseAdminForTests} from '../api/_lib/firebaseAdmin.js';
import todaySummary from '../server/vercel-handlers/finance/transactionsSummary.js';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_PROJECT_ID?.includes('emulator'))
  throw Error('Firestore emulator required');
class Res{statusCode=200;body:any=null;headers:Record<string,string>={};
  setHeader(k:string,v:string){this.headers[k]=v;return this;}
  status(n:number){this.statusCode=n;return this;}
  json(value:any){this.body=value;return this;}}
async function run(){
  resetFirebaseAdminForTests();
  const a=getFirebaseAdmin(),db=a.firestore,suffix=randomBytes(7).toString('hex');
  const org='org_today_payables_'+suffix,entity='entity_today_payables_'+suffix,uid='uid_today_ceo_'+suffix;
  const root=db.collection('organizations').doc(org),e=root.collection('financeEntities').doc(entity);
  await root.set({status:'active',name:'Synthetic Today Church'});
  await db.collection('users').doc(uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
  await e.set({organizationId:org,name:'Synthetic congregation',active:true});
  const originalVerify=a.auth.verifyIdToken;
  a.auth.verifyIdToken=async()=>({uid,mn_app_id:'nestfinance',mn_handoff_version:1,
    mn_organization_id:org,mn_session_version:1}) as any;
  const payable=(id:string,dueDate:string,status='awaiting_review',remainingCents=5000,
    scope=org)=>e.collection('financePayables').doc(id).set({
    organizationId:scope,financeEntityId:entity,description:'Synthetic payable '+id,
    dueDate,status,amountCents:5000,remainingCents,paidCents:5000-remainingCents,postingPerformed:false,
  });
  async function call(){
    const req:any={method:'POST',headers:{
      authorization:'Bearer emulator-only','content-type':'application/json',
      'x-organization-id':org},query:{},body:{financeEntityId:entity,localDate:'2026-10-17'}};
    const res=new Res();await todaySummary(req,res as any);return res;
  }
  try{
    await payable('p1','2026-10-18');
    await payable('p2','2026-10-24','open');
    await payable('paid','2026-10-19','settled',0);
    await payable('outside','2026-10-25','awaiting_review');
    await payable('old','2026-10-16','awaiting_review');
    // This same invoice may be identified by document analysis. Display two
    // different categories rather than adding the two numbers together.
    await e.collection('universalEvidence').doc('evidence-synthetic').set({
      organizationId:org,financeEntityId:entity,processingState:'accepted',duplicate:false,
      transactionAnalysis:{analysis:{dueDate:{value:'2026-10-18'},settlementState:{value:'unpaid'}}},
    });
    const today=await call();
    assert.equal(today.statusCode,200,JSON.stringify(today.body));
    assert.equal(today.body.operational.dueSoonCount,1,'OCR candidate remains a separate queue');
    assert.equal(today.body.operational.registeredPayablesDueSoonCount,2,'two real unpaid obligations');
    assert.equal(today.body.operational.registeredPayablesDueSoonTruncated,false);
    assert.equal(today.body.operational.balance.state,'unavailable','no invented opening balance');
    assert.equal(today.body.operational.balance.amountCents,null);
    assert.equal((await root.collection('financeTransactions').get()).size,0);
    assert.equal((await root.collection('financeJournalEntries').get()).size,0);
    assert.equal((await root.collection('financeAggregates').get()).size,0);

    await payable('foreign','2026-10-20','awaiting_review',5000,'org_foreign');
    const bad=await call();
    assert.equal(bad.statusCode,409,'corrupt scope fails closed');
    assert.equal(bad.body.error,'PAYABLE_READ_INTEGRITY_ERROR');
    console.log('✅ Today T04: 2 unpaid bills, 1 OCR due candidate separately, settled excluded, other month excluded, unknown balance and corrupt tenant denied');
  }finally{a.auth.verifyIdToken=originalVerify;}
}
run().catch(error=>{console.error('T04 registered payables E2E failed',error);process.exitCode=1;});
