import type { Firestore } from 'firebase-admin/firestore';
import { ledgerConfigurationKey,validateLedgerConfiguration,ledgerFailure,ledgerDate } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookScope,bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { assertFinanceCatalogScope } from './financeCatalogScope.js';
import type { TodayOperationalBalance } from '../../../shared/finance/todayOperationalSummary.js';
import { ledgerStateRef } from './certifiedLedgerStore.js';

/** null means the legacy operational model still owns this entity. Once the
 * explicit book is configured, never fall back to legacy transaction sums:
 * they do not contain payable payments or their independent dated reversals. */
export async function loadCertifiedTodayBalance(db:Firestore,organizationId:string,financeEntityId:string):Promise<TodayOperationalBalance|null>{
  const org=db.collection('organizations').doc(organizationId);
  return db.runTransaction(async t=>{
    const config=await t.get(org.collection('financeSettings').doc(ledgerConfigurationKey(financeEntityId)));
    if(!config.exists)return null;
    assertBookScope(config.data(),organizationId,financeEntityId);
    const c=validateLedgerConfiguration(config.data()!.configuration);
    if(ledgerDate(new Date().toISOString(),c.timeZone)<c.firstPeriod+'-01')return {state:'unavailable',amountCents:null,reason:'opening_balance_incomplete'};
    const state=await t.get(ledgerStateRef(db,organizationId,financeEntityId));
    if(!state.exists)return {state:'unavailable',amountCents:null,reason:'opening_balance_incomplete'};
    assertBookScope(state.data(),organizationId,financeEntityId);
    const accounts=await t.get(org.collection('financeAccounts').where('financeEntityId','==',financeEntityId).limit(1001));
    if(accounts.size>1000)ledgerFailure('LEDGER_REPORT_COVERAGE_INCOMPLETE');
    const assets=accounts.docs.filter(d=>d.data().active===true&&d.data().nature==='asset');
    if(!assets.length)return {state:'unavailable',amountCents:null,reason:'no_asset_accounts'};
    let total=0;
    for(const account of assets){
      assertFinanceCatalogScope(account,organizationId,financeEntityId,'financeAccounts');
      if(!c.financeAccounts.some(m=>m.accountId===account.id&&m.type==='asset'))return {state:'unavailable',amountCents:null,reason:'opening_balance_incomplete'};
      const projection=await t.get(org.collection('financeAggregates').doc('ledger_account_'+bookId(financeEntityId,account.id)));
      if(!projection.exists||projection.data()?.openingVerified!==true)return {state:'unavailable',amountCents:null,reason:'opening_balance_incomplete'};
      const p=projection.data()!;assertBookScope(p,organizationId,financeEntityId);
      if(p.accountId!==account.id||!Number.isSafeInteger(p.balanceCents))ledgerFailure('LEDGER_BALANCE_PROJECTION_MISMATCH');
      total+=p.balanceCents;if(!Number.isSafeInteger(total))ledgerFailure('LEDGER_AMOUNT_OVERFLOW');
    }
    return {state:'available',amountCents:total,reason:null};
  });
}
