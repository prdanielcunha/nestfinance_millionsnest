import { assertBookEntry, type CertifiedBookEntry } from './certifiedPosting.js';
import { ledgerDate, ledgerFailure } from './certifiedConfiguration.js';
import { compareCanonicalId } from './postingPlan.js';

function add(a:number,b:number) {
  const value=a+b;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(value))ledgerFailure('LEDGER_AMOUNT_OVERFLOW');
  return value;
}
/** Full input coverage is a caller precondition. Never drop an original entry
 * just because its source transaction was reversed in a later month. */
export function buildCertifiedBookReport(entries:CertifiedBookEntry[],scope:{organizationId:string;financeEntityId:string;startDate:string;endDateExclusive:string}) {
  const {organizationId:org,financeEntityId:entity,startDate:start,endDateExclusive:end}=scope;
  if(ledgerDate(start,'UTC')!==start||ledgerDate(end,'UTC')!==end||start>=end)ledgerFailure('LEDGER_REPORT_PERIOD_INVALID');
  const seen=new Set<string>();
  const rows=new Map<string,{accountId:string;name:string;type:string;normalBalance:string;openingDebitNetCents:number;debitCents:number;creditCents:number;closingDebitNetCents:number}>();
  const journal:CertifiedBookEntry[]=[];
  const ledger:Array<{entryId:string;sourceTransactionId:string;effectiveDate:string;description:string;lineId:string;accountId:string;debitCents:number;creditCents:number;runningDebitNetCents:number;reversalOfEntryId:string|null}>=[];
  const sorted=[...entries].sort((a,b)=>compareCanonicalId(a.effectiveDate,b.effectiveDate)||compareCanonicalId(a.postedAt,b.postedAt)||compareCanonicalId(a.id,b.id));
  for(const entry of sorted) {
    assertBookEntry(entry,org,entity);
    if(seen.has(entry.id))ledgerFailure('LEDGER_DUPLICATE_ENTRY');
    seen.add(entry.id);
    if(entry.effectiveDate>=end)continue;
    if(entry.effectiveDate>=start)journal.push(entry);
    const chart=new Map(entry.accountsSnapshot.map(a=>[a.id,a]));
    for(const line of [...entry.lines].sort((a,b)=>a.sequence-b.sequence)) {
      const account=chart.get(line.ledgerAccountId)!;
      let row=rows.get(account.id);
      if(row&&(row.type!==account.type||row.normalBalance!==account.normalBalance))ledgerFailure('LEDGER_CHART_HISTORY_CONFLICT');
      if(!row){row={accountId:account.id,name:account.name,type:account.type,normalBalance:account.normalBalance,openingDebitNetCents:0,debitCents:0,creditCents:0,closingDebitNetCents:0};rows.set(account.id,row);}
      const delta=add(line.debitCents,-line.creditCents);
      row.closingDebitNetCents=add(row.closingDebitNetCents,delta);
      if(entry.effectiveDate<start)row.openingDebitNetCents=add(row.openingDebitNetCents,delta);
      else {
        row.debitCents=add(row.debitCents,line.debitCents);row.creditCents=add(row.creditCents,line.creditCents);
        ledger.push({entryId:entry.id,sourceTransactionId:entry.sourceTransactionId,effectiveDate:entry.effectiveDate,description:entry.description,
          lineId:line.id,accountId:account.id,debitCents:line.debitCents,creditCents:line.creditCents,runningDebitNetCents:row.closingDebitNetCents,reversalOfEntryId:entry.reversalOfEntryId??null});
      }
    }
  }
  const trialBalance=[...rows.values()].sort((a,b)=>compareCanonicalId(a.accountId,b.accountId));
  const totals=trialBalance.reduce((s,r)=>({openingDebitNetCents:add(s.openingDebitNetCents,r.openingDebitNetCents),debitCents:add(s.debitCents,r.debitCents),creditCents:add(s.creditCents,r.creditCents),closingDebitNetCents:add(s.closingDebitNetCents,r.closingDebitNetCents)}),{openingDebitNetCents:0,debitCents:0,creditCents:0,closingDebitNetCents:0});
  if(totals.openingDebitNetCents!==0||totals.closingDebitNetCents!==0||totals.debitCents!==totals.creditCents)ledgerFailure('LEDGER_REPORT_UNBALANCED');
  return {schemaVersion:1 as const,currency:'BRL' as const,scope,journal,ledger,trialBalance,totals,
    authority:{source:'immutable_balanced_journal' as const,professionalSignOff:false,officialAccountingStatement:false}};
}
