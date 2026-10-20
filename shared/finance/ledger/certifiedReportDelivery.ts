import type { buildCertifiedBookReport } from './certifiedReports.js';

export type CertifiedReportDelivery = ReturnType<typeof deliverCertifiedReport>;
type CompleteReport = ReturnType<typeof buildCertifiedBookReport> & {
  coverage:{complete:true;entryCount:number;revision:number;firstPeriod:string};
  closedThrough:string|null;
};
/** Public report projection: no approver UID, private evidence paths or raw receipts. */
export function deliverCertifiedReport(report:CompleteReport) {
  return {
    schemaVersion:report.schemaVersion,currency:report.currency,scope:report.scope,
    coverage:report.coverage,closedThrough:report.closedThrough,authority:report.authority,
    totals:report.totals,trialBalance:report.trialBalance,ledger:report.ledger,
    journal:report.journal.map(e=>({
      id:e.id,effectiveDate:e.effectiveDate,postedAt:e.postedAt,description:e.description,
      sourceKind:e.sourceKind,sourceTransactionId:e.sourceTransactionId,reversalOfEntryId:e.reversalOfEntryId??null,
      lines:[...e.lines].sort((a,b)=>a.sequence-b.sequence).map(l=>({
        id:l.id,accountId:l.ledgerAccountId,
        accountName:e.accountsSnapshot.find(a=>a.id===l.ledgerAccountId)!.name,
        debitCents:l.debitCents,creditCents:l.creditCents,
      })),
    })),
  };
}
export type CertifiedReportView='journal'|'ledger'|'trialBalance';
type ReportLanguage='PT'|'EN'|'ES';
const HEADERS={
  PT:{date:'Data',entry:'Lançamento',source:'Origem',description:'Descrição',account:'Conta',name:'Nome da conta',debit:'Débito (BRL)',credit:'Crédito (BRL)',opening:'Saldo inicial devedor líquido (BRL)',closing:'Saldo final devedor líquido (BRL)',running:'Saldo devedor acumulado (BRL)',reversal:'Estorno de'},
  EN:{date:'Date',entry:'Entry',source:'Source',description:'Description',account:'Account',name:'Account name',debit:'Debit (BRL)',credit:'Credit (BRL)',opening:'Opening net debit (BRL)',closing:'Closing net debit (BRL)',running:'Running net debit (BRL)',reversal:'Reversal of'},
  ES:{date:'Fecha',entry:'Asiento',source:'Origen',description:'Descripción',account:'Cuenta',name:'Nombre de cuenta',debit:'Debe (BRL)',credit:'Haber (BRL)',opening:'Saldo inicial deudor neto (BRL)',closing:'Saldo final deudor neto (BRL)',running:'Saldo deudor acumulado (BRL)',reversal:'Reversión de'},
};
function cell(value:string){
  // Treat user-authored labels as text in Excel/LibreOffice, including leading whitespace.
  const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(value)||/^[\t\r\n]/.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
}
/** Complete export, independent of table pagination. Values remain numeric cells. */
export function certifiedReportCsv(report:CertifiedReportDelivery,view:CertifiedReportView,language:ReportLanguage){
  const h=HEADERS[language],money=(n:number)=>{
    if(!Number.isSafeInteger(n))throw Error('LEDGER_AMOUNT_INVALID');
    const value=(n/100).toFixed(2);return language==='EN'?value:value.replace('.',',');
  };
  let header:string[],rows:string[][];
  if(view==='journal'){
    header=[h.date,h.entry,h.source,h.description,h.account,h.name,h.debit,h.credit,h.reversal];
    rows=report.journal.flatMap(e=>e.lines.map(l=>[cell(e.effectiveDate),cell(e.id),cell(e.sourceTransactionId),cell(e.description),cell(l.accountId),cell(l.accountName),money(l.debitCents),money(l.creditCents),cell(e.reversalOfEntryId||'')]));
  }else if(view==='ledger'){
    header=[h.date,h.entry,h.source,h.description,h.account,h.debit,h.credit,h.running,h.reversal];
    rows=report.ledger.map(l=>[cell(l.effectiveDate),cell(l.entryId),cell(l.sourceTransactionId),cell(l.description),cell(l.accountId),money(l.debitCents),money(l.creditCents),money(l.runningDebitNetCents),cell(l.reversalOfEntryId||'')]);
  }else{
    header=[h.account,h.name,h.opening,h.debit,h.credit,h.closing];
    rows=report.trialBalance.map(r=>[cell(r.accountId),cell(r.name),money(r.openingDebitNetCents),money(r.debitCents),money(r.creditCents),money(r.closingDebitNetCents)]);
  }
  return '\ufeff'+[header.map(cell).join(';'),...rows.map(r=>r.join(';'))].join('\r\n')+'\r\n';
}
