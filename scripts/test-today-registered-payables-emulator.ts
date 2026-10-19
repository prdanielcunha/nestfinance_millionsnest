import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {getFirebaseAdmin,resetFirebaseAdminForTests} from '../api/_lib/firebaseAdmin.js';
import todaySummary from '../server/vercel-handlers/finance/transactionsSummary.js';
import accountsList from '../server/vercel-handlers/finance/accountsList.js';
import openingHistory from '../server/vercel-handlers/finance/accountsOpeningHistory.js';
import accountsUpdate from '../server/vercel-handlers/finance/accountsUpdate.js';
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
  await root.set({status:'active',name:'Synthetic Today Church',enabledApps:['nestfinance'],entitlements:{nestfinance:{active:true}}});
  await db.collection('users').doc(uid).set({systemRole:'ceo',ecosystemSessionVersion:1});
  await e.set({organizationId:org,name:'Synthetic congregation',active:true});
  const originalVerify=a.auth.verifyIdToken;
  const originalWriteFlag=process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED;
  let actor=uid;
  a.auth.verifyIdToken=async()=>({uid:actor,mn_app_id:'nestfinance',mn_handoff_version:1,
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

    // Membership authority is resolved by the real server resolver, not a UI role.
    const member='uid_synthetic_member_'+suffix;
    await db.collection('users').doc(member).set({displayName:'Synthetic Member',ecosystemSessionVersion:1});
    const memberRef=root.collection('members').doc(member);
    const accountId='acc_'+randomBytes(16).toString('hex');
    await root.collection('financeAccounts').doc(accountId).set({organizationId:org,financeEntityId:entity,
      name:'Synthetic cash',normalizedName:'synthetic cash',currency:'BRL',type:'cash',nature:'asset',active:true,openingBalanceCents:987654321,
      openingBalanceDeclaration:{status:'pending_review',amountCents:987654321}});
    const grant=async(permissions:string[],role='member',scopes:any={financeEntityIds:[entity]})=>memberRef.set({
      role,status:'active',appAccess:{nestFinance:{enabled:true,roles:['finance_team'],permissions,scopes}}});
    const accountCall=async(handler:any,body:any)=>{
      const res=new Res();await handler({method:'POST',headers:{authorization:'Bearer emulator-only',
        'content-type':'application/json','x-organization-id':org},query:{},body},res);return res;};
    actor=member;
    for(const permissions of [
      ['finance.view'],['finance.view','finance.create_drafts'],['finance.view','finance.review'],
    ]) {
      await grant(permissions);
      const restricted=await call();
      assert.equal(restricted.statusCode,200,JSON.stringify(restricted.body));
      assert.deepEqual(restricted.body.operational.balance,{state:'restricted',amountCents:null,reason:'permission_required'});
      assert.equal(JSON.stringify(restricted.body).includes('987654321'),false,'summary must not serialize a hidden balance');
      const accounts=await accountCall(accountsList,{financeEntityId:entity});
      assert.equal(accounts.statusCode,200,JSON.stringify(accounts.body));
      assert.equal('openingBalanceCents' in JSON.parse(JSON.stringify(accounts.body)).accounts[0],false);
      assert.equal(JSON.stringify(accounts.body).includes('987654321'),false,'catalog must not leak initial amounts');
      if(permissions.includes('finance.review')){
        const history=await accountCall(openingHistory,{financeEntityId:entity,accountId});
        assert.equal(history.statusCode,403,'reviewing entries alone does not unlock balance history');
      }
    }
    await grant(['finance.view','finance.balance.view']);
    assert.equal((await call()).body.operational.balance.amountCents,987654321);
    await db.collection('users').doc(member).update({ecosystemSessionVersion:2});
    assert.equal((await accountCall(accountsList,{financeEntityId:entity})).statusCode,401,'old bound tokens must not read opening amounts');
    await grant(['finance.view','finance.accounts.manage','finance.balance.view']);
    process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED='true';
    assert.equal((await accountCall(accountsUpdate,{financeEntityId:entity,accountId,name:'Synthetic cash'})).statusCode,401,
      'old bound tokens must not read opening amounts through an update');
    await db.collection('users').doc(member).update({ecosystemSessionVersion:1});
    await grant(['finance.view','finance.accounts.manage']);
    process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED='true';
    for(const name of ['Synthetic cash','Synthetic renamed cash']){
      const edited=await accountCall(accountsUpdate,{financeEntityId:entity,accountId,name});
      assert.equal(edited.statusCode,200,JSON.stringify(edited.body));
      assert.equal(JSON.stringify(edited.body).includes('987654321'),false,'ordinary/no-op edits cannot reveal hidden opening amounts');
      assert.equal('openingBalanceDeclaration' in edited.body.account,false);
    }
    const correction=await accountCall(accountsUpdate,{financeEntityId:entity,accountId,name:'Synthetic renamed cash',
      expectedOpeningBalanceRevision:0,openingBalanceReason:'Synthetic attempted correction',
      openingBalanceDeclaration:{status:'not_informed'}});
    assert.equal(correction.statusCode,403,'opening corrections require balance permission');
    assert.equal((await root.collection('financeAccounts').doc(accountId).get()).data()?.openingBalanceDeclaration.amountCents,987654321);
    await grant(['finance.view']);
    assert.equal((await call()).body.operational.balance.state,'restricted','revocation must apply on the next request');
    await grant(['finance.view','finance.manage']);
    assert.equal((await call()).body.operational.balance.amountCents,987654321,'full financial management intentionally includes balance');
    for(const role of ['owner','admin']){
      await grant([],role);
      assert.equal((await call()).body.operational.balance.amountCents,987654321,'canonical full administrators retain authority');
    }
    await grant(['finance.view','finance.balance.view'],'member',{financeEntityIds:['synthetic_other_entity']});
    assert.equal((await call()).statusCode,403,'balance grant must not bypass entity scope');
    for(const permissions of [['finance.view','finance.create_drafts','finance.count.execute'],
      ['finance.view','finance.create_drafts','finance.count.execute','finance.balance.view'],['organization.manage_team'],
      ['organization.manage_team','finance.balance.view']]){
      await grant(permissions,'admin');
      assert.equal((await call()).statusCode,403,'count-only and team-only administration never inherit treasury');
      assert.equal((await accountCall(accountsList,{financeEntityId:entity})).statusCode,403,'visibility cannot unlock opening catalogs for Count/team-only');
      assert.equal((await accountCall(accountsUpdate,{financeEntityId:entity,accountId,name:'Synthetic renamed cash'})).statusCode,403,
        'visibility cannot unlock account mutations for Count/team-only');
    }
    actor=uid;

    await payable('foreign','2026-10-20','awaiting_review',5000,'org_foreign');
    const bad=await call();
    assert.equal(bad.statusCode,409,'corrupt scope fails closed');
    assert.equal(bad.body.error,'PAYABLE_READ_INTEGRITY_ERROR');
    console.log('✅ Today T04: 2 unpaid bills, 1 OCR due candidate separately, settled excluded, other month excluded, unknown balance and corrupt tenant denied');
  }finally{a.auth.verifyIdToken=originalVerify;
    if(originalWriteFlag===undefined)delete process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED;
    else process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED=originalWriteFlag;}
}
run().catch(error=>{console.error('T04 registered payables E2E failed',error);process.exitCode=1;});
