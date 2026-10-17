/**
 * T18/T19: An unpaid supplier invoice is NOT an expense payment.
 * This contract only collects a reviewable obligation draft.
 * Never derive ledger liabilities, bank account effects or paid status here.
 */
export type FinancePayableDraftInput = {
  description: string;
  amountCents: number;
  dueDate: string;
  competenceDate?: string;
  payeeName?: string;
  categoryId?: string;
  notes?: string;
};
export type FinancePayableDraft = FinancePayableDraftInput & {
  currency: 'BRL';
  status: 'draft';
  amountPaidCents: 0;
  outstandingCents: number;
  financialPostingPerformed: false;
  source: 'unpaid_expense';
};

const MAX_CENTS=20_000_000_000;
const CATEGORY_ID=/^cat_[a-f0-9]{16}(?:[a-f0-9]{16})?$/;
function validDay(day:unknown):day is string{
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const [y,m,d]=day.split('-').map(Number);
  if(y<1900||y>2100)return false;
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===day;
}
function cleanText(value:unknown,min:number,max:number,label:string,optional=false):string|undefined{
  if((value===null||value===undefined||value==='')&&optional)return undefined;
  if(typeof value!=='string')throw Error('PAYABLE_INVALID_'+label);
  const s=value.trim().replace(/\s+/g,' ');
  if(s.length<min||s.length>max||/[\x00-\x08\x0b-\x0e-\x1f\x7f]/.test(s)) {
    throw Error('PAYABLE_INVALID_'+label);
  }
  return s;
}
export function normalizePayableDraftInput(raw:unknown):FinancePayableDraft{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('PAYABLE_INVALID_PAYLOAD');
  const x=raw as Record<string,unknown>;
  if(Object.keys(x).some(key=>!['description','amountCents','dueDate','competenceDate','payeeName','categoryId','notes'].includes(key))) {
    throw Error('PAYABLE_INVALID_PAYLOAD');
  }
  const description=cleanText(x.description,3,240,'DESCRIPTION')!;
  const payeeName=cleanText(x.payeeName,2,120,'PAYEE',true);
  const notes=cleanText(x.notes,1,500,'NOTES',true);
  if(typeof x.amountCents!=='number'||!Number.isSafeInteger(x.amountCents)||
      x.amountCents<=0||x.amountCents>MAX_CENTS)throw Error('PAYABLE_INVALID_AMOUNT');
  if(!validDay(x.dueDate))throw Error('PAYABLE_INVALID_DUE_DATE');
  if(x.competenceDate!==undefined&&x.competenceDate!==null&&!validDay(x.competenceDate)) {
    throw Error('PAYABLE_INVALID_COMPETENCE_DATE');
  }
  const categoryId=x.categoryId===null||x.categoryId===undefined||x.categoryId===''?undefined:x.categoryId;
  if(categoryId!==undefined&&(typeof categoryId!=='string'||!CATEGORY_ID.test(categoryId))){
    throw Error('PAYABLE_INVALID_CATEGORY');
  }
  return {
    description,amountCents:x.amountCents,dueDate:x.dueDate,
    ...(x.competenceDate?{competenceDate:x.competenceDate as string}:{}),
    ...(payeeName?{payeeName}:{}),
    ...(categoryId?{categoryId:categoryId as string}:{}),
    ...(notes?{notes}:{}),
    currency:'BRL',status:'draft',amountPaidCents:0,
    outstandingCents:x.amountCents,financialPostingPerformed:false,source:'unpaid_expense',
  };
}
