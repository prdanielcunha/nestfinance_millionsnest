import {readFile} from 'node:fs/promises';
import {assertFails,assertSucceeds,initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,deleteDoc,doc,getDoc,getDocs,setDoc,updateDoc} from 'firebase/firestore';
const projectId=process.env.FIREBASE_PROJECT_ID;
const address=process.env.FIRESTORE_EMULATOR_HOST;
if(!projectId?.includes('emulator')||!address)throw Error('Isolated Firestore emulator required');
const [host,portText]=address.split(':');
const rules=await readFile('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(portText),rules}});
const account='organizations/org-opening-test/financeAccounts/account-test';
const versionOne=account+'/openingBalanceHistory/revision-one';
const folder=account+'/openingBalanceHistory';
let checks=0;
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'organizations/org-opening-test'),{status:'active',ownerUid:'org-owner-opening'});
    await setDoc(doc(db,'users/ceo-opening'),{systemRole:'ceo',ecosystemSessionVersion:1});
    await setDoc(doc(db,account),{financeEntityId:'entity-opening',name:'Synthetic account'});
    await setDoc(doc(db,versionOne),{revision:1,current:{status:'pending_review',amountCents:500}});
  });
  const anonymous=env.unauthenticatedContext().firestore();
  const owner=env.authenticatedContext('org-owner-opening').firestore();
  const ceo=env.authenticatedContext('ceo-opening',{mn_app_id:'nestfinance',mn_handoff_version:1,mn_organization_id:'org-opening-test',mn_session_version:1}).firestore();
  await assertSucceeds(getDoc(doc(ceo,account)));checks++;
  for(const [role,db] of [['anonymous',anonymous],['owner',owner],['CEO',ceo]] as const){
    for(const attempt of [
      ()=>getDoc(doc(db,versionOne)),
      ()=>getDocs(collection(db,folder)),
      ()=>setDoc(doc(db,versionOne),{revision:99}),
      ()=>updateDoc(doc(db,versionOne),{revision:99}),
      ()=>deleteDoc(doc(db,versionOne)),
      ()=>setDoc(doc(db,folder+'/new-revision'),{revision:2})
    ]){await assertFails(attempt());checks++;}
    console.log('✅ '+role+' cannot access or mutate opening balance history directly');
  }
  console.log('✅ Opening balance history Firestore Rules: '+checks+' checks');
}finally{await env.cleanup();}
