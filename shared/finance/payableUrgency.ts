import { validPayableDate, type PayableStatus } from './payableObligation.js';

/** Browser-local civil-day label, never a source of accounting truth or payment status. */
export type PayableDueState =
  | { kind:'overdue' | 'today' | 'upcoming'; days:number }
  | { kind:'closed' | 'invalid'; days:null };

const MILLIS_PER_DAY=86400000;
function utcCivilDay(value:string):number {
  const [year,month,day]=value.split('-').map(Number);
  return Date.UTC(year,month-1,day);
}

export function getPayableDueState(input:{
  dueDate:string;
  status:PayableStatus;
  amountCents:number;
  paidCents:number;
  remainingCents:number;
  today:string;
}):PayableDueState {
  if(!validPayableDate(input.dueDate)||!validPayableDate(input.today)||
    !Number.isSafeInteger(input.amountCents)||input.amountCents<=0||
    !Number.isSafeInteger(input.remainingCents)||input.remainingCents<0||
    !Number.isSafeInteger(input.paidCents)||input.paidCents<0||
    input.amountCents>20_000_000_000||
    input.paidCents+input.remainingCents!==input.amountCents||
    !['awaiting_review','open','partially_paid','settled','cancelled'].includes(input.status)) {
    return {kind:'invalid',days:null};
  }
  if(input.status==='settled'||input.status==='cancelled')return {kind:'closed',days:null};
  if(input.status==='awaiting_review'&&input.paidCents!==0)return {kind:'invalid',days:null};
  const diff=(utcCivilDay(input.dueDate)-utcCivilDay(input.today))/MILLIS_PER_DAY;
  if(!Number.isSafeInteger(diff))return {kind:'invalid',days:null};
  if(diff<0)return {kind:'overdue',days:Math.abs(diff)};
  if(diff===0)return {kind:'today',days:0};
  return {kind:'upcoming',days:diff};
}

/** The user's device-local date is a presentation reference only. */
export function localCivilDay(now:Date):string {
  return [String(now.getFullYear()).padStart(4,'0'),
    String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
}
