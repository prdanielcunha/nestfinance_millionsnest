import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
import type { PayableDraft } from '../../shared/finance/payableObligation.js';
export type PayableListRow = PayableDraft & {
  id:string; status:'awaiting_review'|'open'|'partially_paid'|'settled'|'cancelled';
  paidCents:number;remainingCents:number;version:number;postingPerformed:boolean;
  principalPaidCents?:number;discountCents?:number;feesPaidCents?:number;
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
  ledgerStatus(organizationId:string,financeEntityId:string,signal?:AbortSignal){
    return call<LedgerPreparationStatus>('ledger-setup',organizationId,financeEntityId,{action:'status'},signal);
  },
  ledgerProposal(organizationId:string,financeEntityId:string,input:LedgerPreparationInput){
    return call<{proposalHash:string;accountCount:number;categoryCount:number;previousVersion:number}>('ledger-setup',organizationId,financeEntityId,{action:'propose',input});
  },
  ledgerConfigure(organizationId:string,financeEntityId:string,input:LedgerPreparationInput,proposalHash:string,idempotencyKey:string){
    return call<{configured:true;configurationVersion:number}>('ledger-setup',organizationId,financeEntityId,{action:'configure',input,proposalHash,idempotencyKey,requestId:crypto.randomUUID()});
  },
  ledgerOpening(organizationId:string,financeEntityId:string,accountId:string,expectedOpeningRevision:number,reason:string,idempotencyKey:string){
    return call<{openingCertified:true;accountId:string}>('ledger-setup',organizationId,financeEntityId,{action:'opening',accountId,expectedOpeningRevision,reason,idempotencyKey,requestId:crypto.randomUUID()});
  },
  accountingOptions(organizationId:string,financeEntityId:string,signal?:AbortSignal){
    return call<PayableAccountingOptions>('payables-accounting',organizationId,financeEntityId,{action:'options'},signal);
  },
  paymentHistory(organizationId:string,financeEntityId:string,payableId:string,afterId?:string,signal?:AbortSignal){
    return call<PayablePaymentHistory>('payables-accounting',organizationId,financeEntityId,{action:'history',payableId,...(afterId?{afterId}:{})},signal);
  },
  accountingCommand(organizationId:string,financeEntityId:string,payableId:string,expectedVersion:number,action:'recognize'|'payment'|'reverse',payload:Record<string,unknown>,idempotencyKey:string){
    return call<{payableId:string;version:number;remainingCents:number;status:string;journalEntryId:string}>('payables-accounting',organizationId,financeEntityId,{action,payableId,expectedVersion,...payload,idempotencyKey,requestId:crypto.randomUUID()});
  },
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
export type PayableAccountingOptions={state:'ready'|'setup_required'|'opening_required';accounts:Array<{id:string;name:string}>;categories:Array<{id:string;name:string}>;canRecord:boolean;canReverse:boolean;canConfigure:boolean;feesSupported:boolean;discountSupported:boolean};
export type PayablePaymentRow={id:string;principalCents:number;feesCents:number;discountCents:number;cashOutCents:number;paidOn:string;reference:string;reversed:boolean};
export type PayablePaymentHistory={items:PayablePaymentRow[];hasMore:boolean;nextCursor:string|null};
export type LedgerPreparationInput={firstPeriod:string;dateBasis:'occurred_at'|'competence_date';feesCategoryId?:string;discountCategoryId?:string;language:'PT'|'EN'|'ES'};
export type LedgerPreparationStatus={configured:boolean;firstPeriod:string|null;dateBasis:'occurred_at'|'competence_date'|null;feesCategoryId:string;discountCategoryId:string;accounts:Array<{id:string;name:string;revision:number;certified:boolean;declaration:{status:'not_informed'}|{status:'pending_review';amountCents:number;asOf:string;source:string;sourceNote:string}}>;
categories:Array<{id:string;name:string;kind:'income'|'expense'}>};
