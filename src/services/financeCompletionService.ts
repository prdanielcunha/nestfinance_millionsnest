import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
export async function financeCompletionCall<T>(operation:string,organizationId:string,financeEntityId:string,input:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  const user=firebaseAuth.currentUser;if(!user||!organizationId||!financeEntityId)throw Error('UNAUTHORIZED');
  const response=await fetch(`${FINANCE_GATEWAY_PATH}?operation=${encodeURIComponent(operation)}`,{
    method:'POST',cache:'no-store',signal,headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json','x-organization-id':organizationId},
    body:JSON.stringify({financeEntityId,...input}),
  });
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof data.error==='string'?data.error:'FINANCE_REQUEST_FAILED');return data;
}
