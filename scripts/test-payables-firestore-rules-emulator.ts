import { readFile } from 'node:fs/promises';
import { assertFails,assertSucceeds,initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection,deleteDoc,doc,getDoc,getDocs,setDoc,updateDoc } from 'firebase/firestore';
const projectId=process.env.FIREBASE_PROJECT_ID,emulator=process.env.FIRESTORE_EMULATOR_HOST;
if(!projectId?.includes('emulator')||!emulator)throw Error('Firestore emulator required');
const [host,port]=emulator.split(':');
const rules=await readFile('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules}});
const org='org-test-payables-rules',entity='entity-payables';
const folder=`organizations/${org}/financeEntities/${entity}/financePayables`;
const path=`${folder}/pay_1234567890abcdef1234567890abcdef`;
let checks=0;
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,`organizations/${org}`),{status:'active',ownerUid:'owner-payables'});
    await setDoc(doc(db,'users/ceo-payables'),{systemRole:'ceo',ecosystemSessionVersion:1});
    await setDoc(doc(db,`organizations/${org}/financeEntities/${entity}`),{financeEntityId:entity,active:true,name:'Synthetic church'});
    await setDoc(doc(db,path),{financeEntityId:entity,organizationId:org,status:'awaiting_review',amountCents:1500});
  });
  const anonymous=env.unauthenticatedContext().firestore();
  const owner=env.authenticatedContext('owner-payables').firestore();
  const ceo=env.authenticatedContext('ceo-payables',{mn_app_id:'nestfinance',mn_handoff_version:1,mn_organization_id:org,mn_session_version:1}).firestore();
  // Explicit parent organization read remains unchanged.
  await assertSucceeds(getDoc(doc(ceo,`organizations/${org}/financeEntities/${entity}`)));checks++;
  for(const [label,db] of [['anonymous',anonymous],['organization owner',owner],['CEO',ceo]] as const) {
    for(const act of [
      ()=>getDoc(doc(db,path)),
      ()=>getDocs(collection(db,folder)),
      ()=>setDoc(doc(db,path),{status:'settled'}),
      ()=>setDoc(doc(db,`${folder}/pay_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`),{status:'settled'}),
      ()=>updateDoc(doc(db,path),{status:'settled'}),
      ()=>deleteDoc(doc(db,path)),
    ]) {
      await assertFails(act());checks++;
    }
    console.log('✅ '+label+' cannot directly read/change private unpaid bills');
  }
  console.log('✅ T19 Firestore rules '+checks+' denials/positive-control');
} finally {await env.cleanup();}
