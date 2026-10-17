import type { ContributionPurpose, ContributionReceiptMethod } from './contributionBreakdown.js';

/**
 * E06 / T26: deterministic, read-only convention remittance calculation.
 *
 * No debit/credit, payable, transfer, bank payment, posting, notification,
 * journal entry or revenue recognition occurs here. Rules and recorded income
 * are supplied by a future authorized, paginated service; the client cannot
 * certify coverage or substitute a guessed contribution purpose.
 *
 * percentageBasisPoints: 1_000 = 10%. Round *once per rule revision* to the
 * nearest cent, half up; avoid floating point via bigint multiplication.
 */
export type ConventionRule = {
  ruleId: string;
  revision: number;
  financeEntityId: string;
  recipientId: string;
  effectiveFrom: string; // YYYY-MM-DD inclusive
  effectiveThrough: string | null; // YYYY-MM-DD inclusive; null is open-ended
  percentageBasisPoints: number; // 0..10000 inclusive
  eligiblePurposes: Exclude<ContributionPurpose,'unclassified'>[];
  eligibleReceiptMethods: ContributionReceiptMethod[];
  dateBasis: 'received_at';
  rounding: 'half_up';
};

export type ConventionReceipt = {
  receiptId: string; // Canonical finance transaction id, not Count row
  financeEntityId: string;
  receivedAt: string; // YYYY-MM-DD (canonical church-local received date)
  status: 'draft' | 'ready_for_review' | 'approved_for_posting' | 'posted' | 'reversed';
  transactionKind: 'income';
  purpose: ContributionPurpose;
  receiptMethod: ContributionReceiptMethod;
  classificationSource: 'explicit' | 'legacy_unclassified';
  amountCents: number;
};

export type ConventionSegment = {
  ruleId: string;
  revision: number;
  recipientId: string;
  percentageBasisPoints: number;
  eligibleBaseCents: number;
  remittanceDueCents: number;
  sourceReceiptIds: string[];
};
export type ConventionRemittancePreview = {
  financeEntityId: string;
  period: string;
  eligibleBaseCents: number;
  remittanceDueCents: number;
  sourceCount: number;
  excludedReceiptCount: number;
  segments: ConventionSegment[];
  blockers: string[];
  complete: boolean;
  postingPerformed: false;
};

const RECEIPT_STATUSES=new Set(['draft','ready_for_review','approved_for_posting','posted','reversed']);
const PURPOSES=new Set(['tithe','offering','other']);
const METHODS=new Set<ContributionReceiptMethod>(['cash','pix','card','bank_transfer','other']);
const ID=/^[a-zA-Z0-9_.:-]{1,128}$/;
function validDay(day:unknown):day is string {
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const [y,m,d]=day.split('-').map(Number);
  if(y<1900||y>2100)return false;
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===day;
}
function cents(n:unknown):n is number {
  return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=20_000_000_000;
}
function safeTotal(a:number,b:number):number {
  const value=a+b;
  if(!Number.isSafeInteger(value)||value>20_000_000_000)throw Error('CONVENTION_TOTAL_OUT_OF_RANGE');
  return value;
}
function validateRule(raw:ConventionRule,entity:string) {
  if(!raw||typeof raw!=='object'||!ID.test(raw.ruleId)||!ID.test(raw.recipientId)||
    raw.financeEntityId!==entity||!Number.isSafeInteger(raw.revision)||raw.revision<1||
    !validDay(raw.effectiveFrom)||(raw.effectiveThrough!==null&&!validDay(raw.effectiveThrough))||
    (raw.effectiveThrough!==null&&raw.effectiveThrough<raw.effectiveFrom)||
    !Number.isSafeInteger(raw.percentageBasisPoints)||raw.percentageBasisPoints<0||raw.percentageBasisPoints>10000||
    raw.dateBasis!=='received_at'||raw.rounding!=='half_up'||
    !Array.isArray(raw.eligiblePurposes)||raw.eligiblePurposes.length===0||
    raw.eligiblePurposes.some(x=>!PURPOSES.has(x))||
    new Set(raw.eligiblePurposes).size!==raw.eligiblePurposes.length||
    !Array.isArray(raw.eligibleReceiptMethods)||raw.eligibleReceiptMethods.length===0||
    raw.eligibleReceiptMethods.some(x=>!METHODS.has(x))||
    new Set(raw.eligibleReceiptMethods).size!==raw.eligibleReceiptMethods.length) {
    throw Error('CONVENTION_INVALID_RULE');
  }
}
function validateReceipt(r:ConventionReceipt,entity:string) {
  if(!r||typeof r!=='object'||!ID.test(r.receiptId)||r.financeEntityId!==entity||
    !validDay(r.receivedAt)||r.transactionKind!=='income'||!RECEIPT_STATUSES.has(r.status)||
    ![...PURPOSES,'unclassified'].includes(r.purpose)||!METHODS.has(r.receiptMethod)||
    (r.classificationSource!=='explicit'&&r.classificationSource!=='legacy_unclassified')||
    (r.purpose==='unclassified'&&r.classificationSource!=='legacy_unclassified')||
    (r.purpose!=='unclassified'&&r.classificationSource!=='explicit')||
    !cents(r.amountCents))throw Error('CONVENTION_INVALID_RECEIPT');
}
function roundHalfUp(centsValue:number,basisPoints:number):number {
  const result=(BigInt(centsValue)*BigInt(basisPoints)+5000n)/10000n;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('CONVENTION_TOTAL_OUT_OF_RANGE');
  return Number(result);
}

/** Returned preview cannot itself create a payable or mark a payment. */
export function previewConventionRemittance(input:{
  financeEntityId:string;
  period:string; // YYYY-MM
  rules:ConventionRule[];
  receipts:ConventionReceipt[];
  completeSourceCoverage:boolean;
}):ConventionRemittancePreview {
  const {financeEntityId,period,rules,receipts,completeSourceCoverage}=input;
  if(typeof financeEntityId!=='string'||!ID.test(financeEntityId)||
    typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||
    !Array.isArray(rules)||rules.length>100||!Array.isArray(receipts)||receipts.length>10000||
    typeof completeSourceCoverage!=='boolean')throw Error('CONVENTION_INVALID_INPUT');
  rules.forEach(rule=>validateRule(rule,financeEntityId));
  const keys=new Set<string>();
  for(const receipt of receipts){
    validateReceipt(receipt,financeEntityId);
    if(keys.has(receipt.receiptId))throw Error('CONVENTION_DUPLICATE_SOURCE_RECEIPT');
    keys.add(receipt.receiptId);
  }
  const blockers:string[]=[];
  if(!completeSourceCoverage)blockers.push('CONVENTION_SOURCE_COVERAGE_INCOMPLETE');
  if(rules.length===0)blockers.push('CONVENTION_RULE_MISSING');
  // Reject overlapping effective policies even if this particular month has
  // no receipts. Two concurrent percentages must never be chosen arbitrarily.
  for(let i=0;i<rules.length;i++)for(let j=i+1;j<rules.length;j++){
    const a=rules[i],b=rules[j];
    if(a.ruleId===b.ruleId&&a.revision===b.revision){
      throw Error('CONVENTION_DUPLICATE_RULE_REVISION');
    }
    if(a.effectiveFrom<=(b.effectiveThrough??'9999-12-31') &&
       b.effectiveFrom<=(a.effectiveThrough??'9999-12-31')){
      blockers.push('CONVENTION_OVERLAPPING_RULES');
    }
  }
  // A policy must cover the entire reported month, even on days with zero
  // transactions. Otherwise "complete" would silently certify missing dates.
  const year=Number(period.slice(0,4)), month=Number(period.slice(5,7));
  if(year<1900||year>2100)throw Error('CONVENTION_INVALID_INPUT');
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  for(let d=1;d<=lastDay;d++){
    const date=period+'-'+String(d).padStart(2,'0');
    const overlapping=rules.filter(r=>r.effectiveFrom<=date&&
      (r.effectiveThrough===null||r.effectiveThrough>=date)).length;
    if(overlapping===0)blockers.push('CONVENTION_RULE_PERIOD_GAP');
    if(overlapping>1)blockers.push('CONVENTION_OVERLAPPING_RULES');
  }
  const segmentsByRule=new Map<string,ConventionSegment>();
  let excluded=0;
  for(const receipt of receipts) {
    if(!receipt.receivedAt.startsWith(period+'-')||receipt.status!=='posted') {
      excluded++;continue;
    }
    // Legacy Pix or any unknown purpose cannot silently become an eligible
    // tithe or an excluded offering. Human classification is mandatory.
    if(receipt.purpose==='unclassified') {
      blockers.push('CONVENTION_UNCLASSIFIED_POSTED_RECEIPT');
      continue;
    }
    const candidates=rules.filter(rule=>rule.effectiveFrom<=receipt.receivedAt&&
      (rule.effectiveThrough===null||rule.effectiveThrough>=receipt.receivedAt));
    if(candidates.length===0){blockers.push('CONVENTION_RULE_NOT_ACTIVE');continue;}
    if(candidates.length>1){blockers.push('CONVENTION_OVERLAPPING_RULES');continue;}
    const rule=candidates[0];
    if(!rule.eligiblePurposes.includes(receipt.purpose)||
      !rule.eligibleReceiptMethods.includes(receipt.receiptMethod)) {excluded++;continue;}
    const key=rule.ruleId+'#'+rule.revision;
    const existing=segmentsByRule.get(key)??{
      ruleId:rule.ruleId,revision:rule.revision,recipientId:rule.recipientId,
      percentageBasisPoints:rule.percentageBasisPoints,
      eligibleBaseCents:0,remittanceDueCents:0,sourceReceiptIds:[],
    };
    existing.eligibleBaseCents=safeTotal(existing.eligibleBaseCents,receipt.amountCents);
    existing.sourceReceiptIds.push(receipt.receiptId);
    segmentsByRule.set(key,existing);
  }
  const segments=[...segmentsByRule.values()].sort((a,b)=>a.ruleId.localeCompare(b.ruleId)||a.revision-b.revision);
  let eligibleBaseCents=0,remittanceDueCents=0,sourceCount=0;
  for(const segment of segments) {
    segment.sourceReceiptIds.sort();
    segment.remittanceDueCents=roundHalfUp(segment.eligibleBaseCents,segment.percentageBasisPoints);
    eligibleBaseCents=safeTotal(eligibleBaseCents,segment.eligibleBaseCents);
    remittanceDueCents=safeTotal(remittanceDueCents,segment.remittanceDueCents);
    sourceCount+=segment.sourceReceiptIds.length;
  }
  const uniqueBlockers=[...new Set(blockers)].sort();
  return {
    financeEntityId,period,eligibleBaseCents,remittanceDueCents,sourceCount,
    excludedReceiptCount:excluded,segments,blockers:uniqueBlockers,
    complete:uniqueBlockers.length===0,
    postingPerformed:false,
  };
}
