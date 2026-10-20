import type { CertifiedBookEntry } from './ledger/certifiedPosting.js';
export type RemittancePolicy={revision:number;effectivePeriod:string;recipient:string;percentageBasisPoints:number;incomeCategoryIds:string[];expenseCategoryId:string;dueDay:number};
export type RemittanceAssessment={period:string;policy:RemittancePolicy;baseCents:number;amountCents:number;sourceCount:number;sources:Array<{entryId:string;categoryId:string;date:string;netCents:number}>;blockers:string[]};
export function remittancePeriod(value:unknown):value is string{return typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(value);}
export function parseRemittancePolicy(value:unknown,revision:number):RemittancePolicy{
  const p=value as Record<string,any>;
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['effectivePeriod','recipient','percentageBasisPoints','incomeCategoryIds','expenseCategoryId','dueDay'].includes(k))||!remittancePeriod(p.effectivePeriod)||
    typeof p.recipient!=='string'||p.recipient.trim().length<2||p.recipient.trim().length>120||!Number.isSafeInteger(p.percentageBasisPoints)||p.percentageBasisPoints<0||p.percentageBasisPoints>10000||
    !Array.isArray(p.incomeCategoryIds)||p.incomeCategoryIds.length<1||p.incomeCategoryIds.length>100||p.incomeCategoryIds.some((x:unknown)=>typeof x!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(x))||new Set(p.incomeCategoryIds).size!==p.incomeCategoryIds.length||
    typeof p.expenseCategoryId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(p.expenseCategoryId)||!Number.isInteger(p.dueDay)||p.dueDay<1||p.dueDay>28||!Number.isSafeInteger(revision)||revision<1)throw Error('REMITTANCE_POLICY_INVALID');
  return {...p,recipient:p.recipient.trim(),incomeCategoryIds:[...p.incomeCategoryIds].sort(),revision} as RemittancePolicy;
}
/** Category membership is explicitly chosen by the church; no guessed tithe/Pix classification. */
export function assessRemittance(period:string,policy:RemittancePolicy,entries:CertifiedBookEntry[],sourceDate:(entry:CertifiedBookEntry)=>string):RemittanceAssessment{
  if(!remittancePeriod(period))throw Error('REMITTANCE_PERIOD_INVALID');
  const {revision,...material}=policy;parseRemittancePolicy(material,revision);
  if(policy.effectivePeriod>period)throw Error('REMITTANCE_POLICY_NOT_EFFECTIVE');
  const sources:RemittanceAssessment['sources']=[],seen=new Set<string>();let base=0;
  for(const e of entries){
    if(e.sourceKind!=='transaction'||e.plan.transactionKind!=='income')continue;
    if(seen.has(e.id))throw Error('REMITTANCE_DUPLICATE_ENTRY');seen.add(e.id);
    const date=sourceDate(e);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('REMITTANCE_SOURCE_DATE_INVALID');
    if(date.slice(0,7)!==period)continue;
    const byCategory=new Map<string,number>();
    for(const line of e.lines){
      if(!line.categoryId||!policy.incomeCategoryIds.includes(line.categoryId))continue;
      const account=e.accountsSnapshot.find(a=>a.id===line.ledgerAccountId);
      if(account?.type!=='income')continue;
      byCategory.set(line.categoryId,(byCategory.get(line.categoryId)||0)+line.creditCents-line.debitCents);
    }
    for(const [categoryId,netCents] of byCategory){
      if(!Number.isSafeInteger(netCents))throw Error('REMITTANCE_AMOUNT_OVERFLOW');
      base+=netCents;if(!Number.isSafeInteger(base)||Math.abs(base)>20_000_000_000)throw Error('REMITTANCE_AMOUNT_OVERFLOW');
      sources.push({entryId:e.id,categoryId,date,netCents});
    }
  }
  sources.sort((a,b)=>a.entryId.localeCompare(b.entryId)||a.categoryId.localeCompare(b.categoryId));
  const absolute=(BigInt(Math.abs(base))*BigInt(policy.percentageBasisPoints)+5000n)/10000n;
  return {period,policy,baseCents:base,amountCents:Number(absolute)*(base<0?-1:1),sourceCount:sources.length,sources,blockers:base<0?['REMITTANCE_NEGATIVE_BASE_REQUIRES_REVIEW']:[]};
}
