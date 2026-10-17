import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
import type { FinancePayableDraftInput } from '../../shared/finance/payableDraft.js';

export const PAYABLE_DRAFTS_UI_ENABLED =
  import.meta.env.VITE_NESTFINANCE_PAYABLE_DRAFTS_ENABLED === 'true';

export type PayableDraftSummary = {
  id:string;
  description:string;
  amountCents:number;
  amountPaidCents:0;
  outstandingCents:number;
  currency:'BRL';
  dueDate:string;
  competenceDate:string|null;
  payeeName:string|null;
  categoryId:string|null;
  status:'draft';
  version:number;
  financialPostingPerformed:false;
};
export type PayablesPageResult = {
  items:PayableDraftSummary[];
  hasMore:boolean;
  nextCursor:{afterDueDate:string;afterId:string}|null;
  financialPostingPerformed:false;
};
export type PayablesApiError = Error & {code?:string;status?:number};

async function call<T>(
  organizationId:string,
  operation:string,
  body:Record<string,unknown>,
):Promise<T>{
  const user=firebaseAuth.currentUser;
  if(!user)throw Error('UNAUTHORIZED');
  if(!organizationId)throw Error('FORBIDDEN');
  const response=await fetch(
    `${FINANCE_GATEWAY_PATH}?operation=${encodeURIComponent(operation)}`,{
      method:'POST',cache:'no-store',
      headers:{
        'Authorization':'Bearer '+await user.getIdToken(),
        'Content-Type':'application/json',
        'x-organization-id':organizationId,
      },
      body:JSON.stringify(body),
    });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const code=typeof data.error==='string'?data.error:'PAYABLE_REQUEST_FAILED';
    const error=new Error(code) as PayablesApiError;
    error.code=code;
    error.status=response.status;
    throw error;
  }
  return data as T;
}
export const payablesService={
  createDraft:(organizationId:string,financeEntityId:string,draft:FinancePayableDraftInput,idempotencyKey:string)=>{
    if(!idempotencyKey||typeof crypto.randomUUID!=='function')throw Error('SECURE_RANDOM_UNAVAILABLE');
    return call<{payableId:string;status:'draft';version:1;financialPostingPerformed:false}>(
      organizationId,'payables-create-draft',
      {financeEntityId,draft,idempotencyKey,requestId:'req_'+crypto.randomUUID()},
    );
  },
  list:(organizationId:string,financeEntityId:string,
    cursor?:{afterDueDate:string;afterId:string})=>
    call<PayablesPageResult>(organizationId,'payables-list',{
      financeEntityId,...(cursor||{}),
    }),
};
