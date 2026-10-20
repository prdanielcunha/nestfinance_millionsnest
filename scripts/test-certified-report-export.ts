import assert from 'node:assert/strict';
import { certifiedReportCsv,type CertifiedReportDelivery } from '../shared/finance/ledger/certifiedReportDelivery.js';
const report={schemaVersion:1,currency:'BRL',scope:{organizationId:'synthetic_org',financeEntityId:'synthetic_entity',startDate:'2026-10-01',endDateExclusive:'2026-11-01'},coverage:{complete:true,entryCount:100,revision:10,firstPeriod:'2026-10'},closedThrough:null,authority:{source:'immutable_balanced_journal',professionalSignOff:false,officialAccountingStatement:false},totals:{openingDebitNetCents:0,debitCents:10000,creditCents:10000,closingDebitNetCents:0},trialBalance:[],ledger:[],journal:[]} as CertifiedReportDelivery;
const dangerous=['=SUM(1,2)',' +CMD()','@import','-DDE()','\tformula','\nformula','safe;"quoted"'];
for(const [i,name] of dangerous.entries()){
  report.trialBalance.push({accountId:'synthetic_'+i,name,type:'asset',normalBalance:'debit',openingDebitNetCents:-123,closingDebitNetCents:456,debitCents:579,creditCents:0});
}
for(const language of ['PT','EN','ES'] as const){
  const csv=certifiedReportCsv(report,'trialBalance',language);
  for(const name of dangerous.slice(0,-1))assert.ok(csv.includes('"\''+name.replace(/"/g,'""')+'"'),'untrusted spreadsheet expressions remain text');
  assert.ok(csv.includes('"safe;""quoted"""'),'separators and quotes stay inside one cell');
  assert.ok(csv.includes(language==='EN'?';-1.23;5.79;0.00;4.56':';-1,23;5,79;0,00;4,56'),'numeric debit/credit balances preserve cents and signs');
}
for(let i=0;i<101;i++){
  report.ledger.push({entryId:'synthetic_entry_'+i,lineId:'synthetic_line_'+i,sourceTransactionId:'synthetic_source',effectiveDate:'2026-10-10',description:'Synthetic',accountId:'synthetic_account',debitCents:100,creditCents:0,runningDebitNetCents:(i+1)*100,reversalOfEntryId:null});
}
const csv=certifiedReportCsv(report,'ledger','PT');
assert.equal(csv.split('\r\n').length,103,'all 101 ledger rows exported independently of UI page size');
assert.ok(csv.includes('synthetic_entry_100'));
assert.throws(()=>certifiedReportCsv({...report,trialBalance:[{...report.trialBalance[0],debitCents:Number.NaN}]},'trialBalance','PT'),/LEDGER_AMOUNT_INVALID/);
console.log('Certified report export passed: formula injection, leading whitespace, delimiter/newline/quote handling, cents/signs/locales, complete multi-page export, invalid amount refusal.');
