/** Canonical transaction read model; never add raw evidence/counts to their derived transactions. */
export const RECEIPT_METHODS = ['cash','pix','credit_card','debit_card','bank_transfer','other'] as const;
export type ReceiptMethod = typeof RECEIPT_METHODS[number];
export type ReceiptAmounts = Record<ReceiptMethod, number>;
export type ReceiptInput = {
  id: string; transactionKind: string; status: string; amountCents: number;
  currency: string; occurredAt: string; paymentMethod: string;
  countSource?: { countSessionId?: string; countEntryType?: string; countReceiptMethod?: string };
};
export type ReceivedIncome = {
  startDate: string; endDate: string; timezone: string; currency: 'BRL'; dateBasis: 'occurredAt'; complete: boolean;
  confirmedCents: number; pendingCents: number;
  confirmedByMethod: ReceiptAmounts; pendingByMethod: ReceiptAmounts;
  days: { date: string; confirmedCents: number; pendingCents: number }[];
  excluded: { conflictingCountRecords: number; invalidRecords: number; unsupportedCurrency: number };
};
const emptyAmounts = (): ReceiptAmounts => ({cash:0,pix:0,credit_card:0,debit_card:0,bank_transfer:0,other:0});
function add(a:number,b:number) {
  const value=a+b;
  if(!Number.isSafeInteger(value))throw new Error('RECEIPTS_AMOUNT_OVERFLOW');
  return value;
}
export function validReceiptDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function receiptDay(value:unknown,timezone:string):string|null {
  if(validReceiptDate(value))return value;
  if(typeof value!=='string'||!validReceiptDate(value.slice(0,10))||!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function buildReceivedIncome(input:{startDate:string;endDate:string;timezone:string;transactions:ReceiptInput[]}):ReceivedIncome {
  if(!validReceiptDate(input.startDate)||!validReceiptDate(input.endDate)||input.startDate>input.endDate)throw new Error('INVALID_RECEIPTS_PERIOD');
  new Intl.DateTimeFormat('en-US',{timeZone:input.timezone}).format();
  const result:ReceivedIncome={startDate:input.startDate,endDate:input.endDate,timezone:input.timezone,currency:'BRL',dateBasis:'occurredAt',complete:true,
    confirmedCents:0,pendingCents:0,confirmedByMethod:emptyAmounts(),pendingByMethod:emptyAmounts(),days:[],
    excluded:{conflictingCountRecords:0,invalidRecords:0,unsupportedCurrency:0}};
  const ids=new Set<string>();
  const countKeys=new Map<string,string[]>();
  for(const tx of input.transactions){
    if(!tx.id||ids.has(tx.id))throw new Error('RECEIPTS_DUPLICATE_TRANSACTION_ID');
    ids.add(tx.id);
    if(tx.transactionKind!=='income'||tx.status==='reversed')continue;
    const source=tx.countSource;
    if(!source?.countSessionId||!source.countEntryType)continue;
    const key=JSON.stringify([source.countSessionId,source.countEntryType,source.countReceiptMethod||tx.paymentMethod]);
    countKeys.set(key,[...(countKeys.get(key)||[]),tx.id]);
  }
  const conflicts=new Set([...countKeys.values()].filter(rows=>rows.length>1).flat());
  const days=new Map<string,{date:string;confirmedCents:number;pendingCents:number}>();
  for(const tx of input.transactions){
    if(tx.transactionKind!=='income'||tx.status==='reversed')continue;
    const day=receiptDay(tx.occurredAt,input.timezone);
    if(!day){result.excluded.invalidRecords++;continue;}
    if(day<input.startDate||day>input.endDate)continue;
    if(!['posted','draft','ready_for_review','approved_for_posting'].includes(tx.status)||!Number.isSafeInteger(tx.amountCents)||tx.amountCents<=0){result.excluded.invalidRecords++;continue;}
    if(tx.currency!=='BRL'){result.excluded.unsupportedCurrency++;continue;}
    if(conflicts.has(tx.id)){result.excluded.conflictingCountRecords++;continue;}
    const method:ReceiptMethod=RECEIPT_METHODS.includes(tx.paymentMethod as ReceiptMethod)?tx.paymentMethod as ReceiptMethod:'other';
    const amounts=tx.status==='posted'?result.confirmedByMethod:result.pendingByMethod;
    amounts[method]=add(amounts[method],tx.amountCents);
    const field=tx.status==='posted'?'confirmedCents':'pendingCents';
    const row=days.get(day)||{date:day,confirmedCents:0,pendingCents:0};
    result[field]=add(result[field],tx.amountCents);row[field]=add(row[field],tx.amountCents);days.set(day,row);
  }
  result.days=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
  result.complete=Object.values(result.excluded).every(value=>value===0);
  return result;
}
