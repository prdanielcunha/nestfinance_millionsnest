import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertFails,initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection,deleteDoc,doc,getDoc,getDocs,setDoc,updateDoc } from 'firebase/firestore';
const projectId=process.env.FIREBASE_PROJECT_ID,endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!projectId?.startsWith('demo-')||!endpoint)throw Error('An isolated demo emulator is mandatory');
const [host,port]=endpoint.split(':');
// Finance does not publish shared Rules. Exercise the exact Hub-certified source,
// never the historical local file whose client-read contract is superseded.
const rulesPath=process.env.HUB_CANONICAL_RULES_FILE;
if(!rulesPath)throw Error('HUB_CANONICAL_RULES_FILE is mandatory');
const rules=await readFile(rulesPath,'utf8');
if(createHash('sha256').update(rules).digest('hex')!=='5372febb59a285e40a567d6caaf5b35ac9ed97f23646e0ffe93959a6bf55f8cd')throw Error('Uncertified Hub Rules source');
const environment=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules}});
const org='synthetic_payment_rules',entity='synthetic_church_rules';
const root=`organizations/${org}`,bill=`${root}/financeEntities/${entity}/financePayables/pay_${'a'.repeat(32)}`;
const paths=[`${root}/financeSettings/ledger_configuration_synthetic`,`${root}/financeAggregates/ledger_account_synthetic`,`${root}/financeAggregates/payable_cash_day_synthetic`,`${root}/financeJournalEntries/je_synthetic`,`${bill}/paymentReceipts/payment_synthetic`,`${bill}/paymentReversals/payment_synthetic`];
let checks=0;
try{
  await environment.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();await setDoc(doc(db,root),{status:'active',ownerUid:'synthetic_owner_rules'});
    await setDoc(doc(db,'users/synthetic_ceo_rules'),{systemRole:'ceo',ecosystemSessionVersion:1});
    await setDoc(doc(db,`${root}/financeEntities/${entity}`),{organizationId:org,financeEntityId:entity,active:true});
    for(const path of paths)await setDoc(doc(db,path),{organizationId:org,financeEntityId:entity,synthetic:true});
  });
  const anonymous=environment.unauthenticatedContext().firestore(),owner=environment.authenticatedContext('synthetic_owner_rules').firestore();
  const ceo=environment.authenticatedContext('synthetic_ceo_rules',{mn_app_id:'nestfinance',mn_handoff_version:1,mn_organization_id:org,mn_session_version:1}).firestore();
  await assertFails(getDoc(doc(ceo,`${root}/financeEntities/${entity}`)));checks++;
  for(const client of [anonymous,owner,ceo])for(const path of paths){
    await assertFails(getDoc(doc(client,path)));checks++;
    await assertFails(getDocs(collection(client,path.slice(0,path.lastIndexOf('/')))));checks++;
    await assertFails(setDoc(doc(client,path),{balanceCents:0,openingVerified:true}));checks++;
    await assertFails(updateDoc(doc(client,path),{status:'settled'}));checks++;
    await assertFails(deleteDoc(doc(client,path)));checks++;
  }
  console.log(`Payable settlement Rules passed: ${checks} checks; no client, owner or CEO can directly read/change private configuration, journals, balance/day projections, payment receipts or reversals.`);
}finally{await environment.cleanup();}
