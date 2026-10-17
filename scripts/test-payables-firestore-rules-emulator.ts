import { readFile } from 'node:fs/promises';
import { assertFails,assertSucceeds,initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection,deleteDoc,doc,getDoc,getDocs,setDoc,updateDoc } from 'firebase/firestore';

const projectId=process.env.FIREBASE_PROJECT_ID,endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!projectId?.includes('emulator')||!endpoint)throw Error('Isolated emulator required');
const [host,portText]=endpoint.split(':');
const rules=await readFile('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(portText),rules}});
const org='org_payable_rules';
const path='organizations/'+org+'/financeObligations/obl_1234567890abcdef1234567890abcdef';
const other='organizations/'+org+'/financeAccounts/acc_1234567890abcdef1234567890abcdef';
let attempts=0;
async function deny(promise:Promise<unknown>,reason:string){
  await assertFails(promise);attempts++;console.log('✅ '+reason);
}
try{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'organizations/'+org),{status:'active',ownerUid:'payables_owner'});
    await setDoc(doc(db,'users/payables_ceo'),{systemRole:'ceo',ecosystemSessionVersion:1});
    await setDoc(doc(db,other),{name:'Synthetic cash account'});
    await setDoc(doc(db,path),{description:'Secret payable bill',amountCents:12345,financeEntityId:'church_a'});
  });
  const users=[
    ['anonymous',env.unauthenticatedContext().firestore()],
    ['organization owner',env.authenticatedContext('payables_owner').firestore()],
    ['global CEO',env.authenticatedContext('payables_ceo',{
      mn_app_id:'nestfinance',mn_handoff_version:1,
      mn_organization_id:org,mn_session_version:1,
    }).firestore()],
  ] as const;
  // Positive control confirms CEO's ordinary read is not globally denied.
  await assertSucceeds(getDoc(doc(users[2][1],other)));attempts++;
  for(const [role,db] of users){
    await deny(getDoc(doc(db,path)),role+' cannot read a payable document directly');
    await deny(getDocs(collection(db,'organizations/'+org+'/financeObligations')),role+' cannot list payables directly');
    await deny(setDoc(doc(db,path),{amountCents:1}),role+' cannot overwrite a payable');
    await deny(updateDoc(doc(db,path),{status:'paid'}),role+' cannot mark paid');
    await deny(deleteDoc(doc(db,path)),role+' cannot delete bill history');
    await deny(setDoc(doc(db,'organizations/'+org+'/financeObligations/obl_new'),{status:'paid'}),role+' cannot create a payable');
  }
  console.log('✅ T18/T19 payables Rules: '+attempts+' real operations');
}finally{await env.cleanup();}
