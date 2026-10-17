/**
 * T18–T19. An expense that has NOT been paid is a separate obligation,
 * not an expense already posted to a cash/bank account.
 * This is a creation contract for reviewable planning only.
 * It is deliberately NOT a settlement, transfer, journal or bank transaction.
 */
export type PayableDraft = {
  description: string;
  counterparty: string;
  amountCents: number;
  dueDate: string;
  documentReference?: string;
  notes?: string;
};
export type PayableStatus = 'awaiting_review' | 'open' | 'partially_paid' | 'settled' | 'cancelled';
export type PayableRecord = PayableDraft & {
  organizationId: string;
  financeEntityId: string;
  status: PayableStatus;
  paidCents: number;
  remainingCents: number;
  version: number;
  schemaVersion: 1;
  postingPerformed: false;
};

export function validPayableDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  return year>=2000 && year<=2200 && new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)===value;
}
const clean=(value: unknown,max: number,min=0):string=>{
  if(typeof value!=='string')throw Error('PAYABLE_INVALID_TEXT');
  const text=value.trim().replace(/\s+/g,' ');
  if(text.length<min||text.length>max)throw Error('PAYABLE_INVALID_TEXT');
  return text;
};
export function parsePayableDraft(value: unknown):PayableDraft {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PAYABLE_INVALID_BODY');
  const o=value as Record<string,unknown>;
  const allowed=new Set(['description','counterparty','amountCents','dueDate','documentReference','notes']);
  if(Object.keys(o).some(k=>!allowed.has(k)))throw Error('PAYABLE_UNKNOWN_FIELD');
  if(!Number.isSafeInteger(o.amountCents)||typeof o.amountCents!=='number'||
    o.amountCents<1||o.amountCents>20_000_000_000)throw Error('PAYABLE_INVALID_AMOUNT');
  if(!validPayableDate(o.dueDate))throw Error('PAYABLE_INVALID_DUE_DATE');
  const description=clean(o.description,180,3);
  const counterparty=clean(o.counterparty,120,2);
  const documentReference=o.documentReference===undefined?undefined:clean(o.documentReference,100,1);
  const notes=o.notes===undefined?undefined:clean(o.notes,500);
  return {description,counterparty,amountCents:o.amountCents,dueDate:o.dueDate,
    ...(documentReference?{documentReference}:{}),
    ...(notes?{notes}:{})};
}
export function buildUnpaidPayable(draft:PayableDraft,organizationId:string,financeEntityId:string):PayableRecord{
  if(!organizationId||!financeEntityId)throw Error('PAYABLE_SCOPE_REQUIRED');
  return {...draft,organizationId,financeEntityId,status:'awaiting_review',
    paidCents:0,remainingCents:draft.amountCents,version:1,schemaVersion:1,postingPerformed:false};
}
