import type { Transaction } from 'firebase-admin/firestore';
import { ledgerConfigurationKey, ledgerFailure, validateLedgerConfiguration } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookScope, bookId, type CertifiedBookEntry } from '../../../shared/finance/ledger/certifiedPosting.js';
import { buildCertifiedBookReport } from '../../../shared/finance/ledger/certifiedReports.js';
import { readLedgerState, type LedgerCommandContext } from './certifiedLedgerStore.js';

export const CERTIFIED_BOOK_ENTRY_LIMIT=5000;
/** Transaction snapshot + exact entry count prove coverage. No truncated
 * balanced subset, guessed opening or client-supplied journal is accepted. */
export async function loadCertifiedBookReadModel(t:Transaction,c:LedgerCommandContext,startDate:string,endDateExclusive:string,includeInternal=false) {
  const org=c.db.collection('organizations').doc(c.organizationId);
  const state=await readLedgerState(t,c);
  const configSnap=await t.get(org.collection('financeSettings').doc(ledgerConfigurationKey(c.financeEntityId)));
  if(!configSnap.exists)ledgerFailure('LEDGER_NOT_CONFIGURED');
  assertBookScope(configSnap.data(),c.organizationId,c.financeEntityId);
  const configuration=validateLedgerConfiguration(configSnap.data()!.configuration);
  const journals=await t.get(org.collection('financeJournalEntries').where('financeEntityId','==',c.financeEntityId).limit(CERTIFIED_BOOK_ENTRY_LIMIT+1));
  if(journals.size>CERTIFIED_BOOK_ENTRY_LIMIT||journals.size!==state.value.entryCount)ledgerFailure('LEDGER_REPORT_COVERAGE_INCOMPLETE');
  const entries=journals.docs.map(d=>{
    const entry=d.data() as CertifiedBookEntry;
    if(entry.id!==d.id)ledgerFailure('LEDGER_ENTRY_INTEGRITY_INVALID');
    return entry;
  });
  const report=buildCertifiedBookReport(entries,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,startDate,endDateExclusive});
  if(startDate<configuration.firstPeriod+'-01')ledgerFailure('LEDGER_DATE_BEFORE_FIRST_PERIOD');
  for(const mapping of configuration.financeAccounts) {
    const receipt=await t.get(org.collection('financeSettings').doc('ledger_opening_'+bookId(c.financeEntityId,mapping.accountId)));
    const balance=await t.get(org.collection('financeAggregates').doc('ledger_account_'+bookId(c.financeEntityId,mapping.accountId)));
    if(!receipt.exists||!balance.exists)ledgerFailure('LEDGER_ACCOUNT_OPENING_REQUIRED');
    const r=receipt.data()!,b=balance.data()!;
    assertBookScope(r,c.organizationId,c.financeEntityId);assertBookScope(b,c.organizationId,c.financeEntityId);
    if(r.accountId!==mapping.accountId||b.accountId!==mapping.accountId||b.openingVerified!==true||r.journalEntryId!==b.openingJournalEntryId||
      r.declaration?.asOf!==configuration.firstPeriod+'-01'||r.declaration?.amountCents!==b.openingCents||b.openingReceiptId!==receipt.id)ledgerFailure('LEDGER_OPENING_INTEGRITY_INVALID');
    const opening=r.journalEntryId?entries.find(e=>e.id===r.journalEntryId):null;
    if(r.declaration.amountCents===0 ? r.journalEntryId!==null : !opening||opening.sourceKind!=='opening'||opening.sourceHash!==r.declarationHash||opening.effectiveDate!==r.declaration.asOf)ledgerFailure('LEDGER_OPENING_INTEGRITY_INVALID');
    let balanceCents=0;
    for(const entry of entries)for(const effect of entry.plan.accountEffects.filter(e=>e.financeAccountId===mapping.accountId)) {
      balanceCents+=effect.effect==='increase'?effect.amountCents:-effect.amountCents;
      if(!Number.isSafeInteger(balanceCents))ledgerFailure('LEDGER_AMOUNT_OVERFLOW');
    }
    if(balanceCents!==b.balanceCents)ledgerFailure('LEDGER_BALANCE_PROJECTION_MISMATCH');
  }
  return {...report,coverage:{complete:true as const,entryCount:entries.length,revision:state.value.revision,firstPeriod:configuration.firstPeriod},closedThrough:state.value.closedThrough,...(includeInternal?{internalEntries:entries,internalConfiguration:configuration}:{})};
}
