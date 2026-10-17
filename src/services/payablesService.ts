import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
import type { PayableDraft } from '../../shared/finance/payableObligation.js';
export type PayableListRow = PayableDraft & {
  id:string; status:'awaiting_review'|'open'|'partially_paid'|'settled'|'cancelled';
  paidCents:number;remainingCents:number;version:number;postingPerformed:false;
};
export type PayableListPage = {
  financeEntityId:string;items:PayableListRow[];hasMore:boolean;nextCursor:string|null;
  postingPerformed:false;
  creationEnabled:boolean;
  reviewEnabled:boolean;
};
async function call<T>(operation:string,org:string,financeEntityId:string,body:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  const user=firebaseAuth.currentUser;
  if(!user||!org||!financeEntityId)throw Error('UNAUTHORIZED');
  const result=await fetch(`${FINANCE_GATEWAY_PATH}?operation=${encodeURIComponent(operation)}`,{
    method:'POST',cache:'no-store',signal,
    headers:{
      Authorization:'Bearer '+await user.getIdToken(),
      'Content-Type':'application/json',
      'x-organization-id':org,
    },
    body:JSON.stringify({financeEntityId,...body}),
  });
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw Error(typeof data.error==='string'?data.error:'PAYABLE_REQUEST_FAILED');
  return data as T;
}
export const payablesService={
  list(organizationId:string,financeEntityId:string,afterId?:string,signal?:AbortSignal){
    return call<PayableListPage>('payables-list',organizationId,financeEntityId,
      afterId?{afterId}:{},signal);
  },
  review(organizationId:string,financeEntityId:string,payableId:string,expectedVersion:number,idempotencyKey:string){
    return call<{id:string;status:'open';version:number;paidCents:0;remainingCents:number;postingPerformed:false}>(
      'payables-review',organizationId,financeEntityId,{
        payableId,expectedVersion,idempotencyKey,requestId:crypto.randomUUID(),
      });
  },
  create(organizationId:string,financeEntityId:string,payload:PayableDraft,idempotencyKey:string){
    return call<{id:string;status:'awaiting_review';version:1;postingPerformed:false}>(
      'payables-create',organizationId,financeEntityId,{
        payload,idempotencyKey,requestId:crypto.randomUUID(),
      });
  },
};
