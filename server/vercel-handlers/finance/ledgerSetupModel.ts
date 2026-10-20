import type { Firestore,Transaction } from 'firebase-admin/firestore';
import { canonicalStringify } from '../../../shared/finance/ledger/postingPlan.js';
import { ledgerConfigurationKey,ledgerFailure,validateLedgerConfiguration,type CertifiedLedgerConfiguration } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookScope,bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { payablePolicyReferences,type PayableAccountingPolicy } from '../../../shared/finance/payableSettlement.js';
import { payablePolicyKey } from './payableSettlementStore.js';

export type LedgerSetupInput={firstPeriod:string;dateBasis:'occurred_at'|'competence_date';feesCategoryId?:string;discountCategoryId?:string;language:'PT'|'EN'|'ES'};
export async function buildLedgerSetupProposal(db:Firestore,organizationId:string,financeEntityId:string,input:LedgerSetupInput,t?:Transaction){
  if(!input||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.firstPeriod)||!['occurred_at','competence_date'].includes(input.dateBasis)||!['PT','EN','ES'].includes(input.language))ledgerFailure('LEDGER_SETUP_INPUT_INVALID');
  const org=db.collection('organizations').doc(organizationId),read=(ref:any):Promise<any>=>t?t.get(ref):ref.get();
  const configRef=org.collection('financeSettings').doc(ledgerConfigurationKey(financeEntityId));
  const policyRef=org.collection('financeSettings').doc(payablePolicyKey(financeEntityId));
  const [oldConfig,oldPolicy,accounts,categories,entitySnap]=await Promise.all([
    read(configRef),read(policyRef),read(org.collection('financeAccounts').where('financeEntityId','==',financeEntityId).limit(201)),
    read(org.collection('financeCategories').where('financeEntityId','==',financeEntityId).limit(201)),read(org.collection('financeEntities').doc(financeEntityId)),
  ]);
  if(!entitySnap.exists||entitySnap.data()?.organizationId!==organizationId||entitySnap.data()?.active!==true)ledgerFailure('FINANCE_ENTITY_NOT_ACTIVE');
  if(accounts.size>200||categories.size>200)ledgerFailure('LEDGER_CONFIGURATION_LIMIT');
  if(oldConfig.exists)assertBookScope(oldConfig.data(),organizationId,financeEntityId);
  if(oldPolicy.exists)assertBookScope(oldPolicy.data(),organizationId,financeEntityId);
  const previous=oldConfig.exists?validateLedgerConfiguration(oldConfig.data().configuration):null;
  if(previous&&(previous.firstPeriod!==input.firstPeriod||previous.dateBasis!==input.dateBasis))ledgerFailure('LEDGER_SETUP_EXISTING_BASIS_IMMUTABLE');
  const names=input.language==='PT'?{equity:'Valor inicial informado',control:'Contas a pagar'}:input.language==='ES'?{equity:'Importe inicial declarado',control:'Cuentas por pagar'}:{equity:'Declared opening amount',control:'Bills to pay'};
  const equity=previous?.openingEquityAccountId??'la_opening_equity';
  const liability=oldPolicy.data()?.policy?.liabilityLedgerAccountId??'la_payables_control';
  const configuration:CertifiedLedgerConfiguration=previous?structuredClone(previous):{schemaVersion:1,enabled:true,version:1,firstPeriod:input.firstPeriod,timeZone:'America/Sao_Paulo',currency:'BRL',dateBasis:input.dateBasis,openingEquityAccountId:equity,
    accounts:[{id:equity,name:names.equity,type:'equity',normalBalance:'credit',active:true,postingAllowed:true}],financeAccounts:[],categories:[]};
  configuration.version=(previous?.version??0)+1;configuration.enabled=true;
  if(!configuration.accounts.some(a=>a.id===liability))configuration.accounts.push({id:liability,name:names.control,type:'liability',normalBalance:'credit',active:true,postingAllowed:true});
  const catalog:Array<{id:string;kind:'account'|'category';name:string;type:string;active:boolean;configurationStatus:string|null}>=[];
  const openingAccounts:Array<{id:string;name:string;revision:number;declaration:unknown}>=[];
  for(const doc of accounts.docs){
    const a=doc.data();assertBookScope(a,organizationId,financeEntityId);
    if(a.active!==true||!['asset','liability'].includes(a.nature))continue;
    if(a.configurationStatus!=='complete')ledgerFailure('LEDGER_FINANCE_ACCOUNT_UNAVAILABLE');
    const name=String(a.name||'').trim();if(!name||name.length>120)ledgerFailure('LEDGER_ACCOUNT_INVALID');
    catalog.push({id:doc.id,kind:'account',name,type:a.nature,active:a.active,configurationStatus:a.configurationStatus});
    openingAccounts.push({id:doc.id,name,revision:a.openingBalanceRevision??0,declaration:a.openingBalanceDeclaration??{status:'not_informed'}});
    if(!configuration.financeAccounts.some(m=>m.accountId===doc.id)){
      const id='la_account_'+bookId(financeEntityId,doc.id).slice(0,32);
      configuration.financeAccounts.push({accountId:doc.id,ledgerAccountId:id,type:a.nature});
      configuration.accounts.push({id,name,type:a.nature,normalBalance:a.nature==='asset'?'debit':'credit',active:true,postingAllowed:true});
    }
  }
  const categoryOptions:Array<{id:string;name:string;kind:'income'|'expense'}>=[];
  for(const doc of categories.docs){
    const c=doc.data();assertBookScope(c,organizationId,financeEntityId);
    if(c.active!==true||!['income','expense'].includes(c.kind))continue;
    const name=String(c.name||'').trim();if(!name||name.length>120)ledgerFailure('LEDGER_ACCOUNT_INVALID');
    catalog.push({id:doc.id,kind:'category',name,type:c.kind,active:c.active,configurationStatus:c.configurationStatus??null});
    categoryOptions.push({id:doc.id,name,kind:c.kind});
    if(!configuration.categories.some(m=>m.categoryId===doc.id)){
      const id='la_category_'+bookId(financeEntityId,doc.id).slice(0,32);
      configuration.categories.push({categoryId:doc.id,ledgerAccountId:id,kind:c.kind});
      configuration.accounts.push({id,name,type:c.kind,normalBalance:c.kind==='income'?'credit':'debit',active:true,postingAllowed:true});
    }
  }
  for(const m of configuration.financeAccounts)if(!catalog.some(c=>c.kind==='account'&&c.id===m.accountId&&c.type===m.type))ledgerFailure('LEDGER_FINANCE_ACCOUNT_UNAVAILABLE');
  for(const m of configuration.categories)if(!catalog.some(c=>c.kind==='category'&&c.id===m.categoryId&&c.type===m.kind))ledgerFailure('LEDGER_CATEGORY_UNAVAILABLE');
  const policy:PayableAccountingPolicy={version:(oldPolicy.data()?.policy?.version??0)+1,liabilityLedgerAccountId:liability,
    ...(input.feesCategoryId?{feesCategoryId:input.feesCategoryId}:{}),...(input.discountCategoryId?{discountCategoryId:input.discountCategoryId}:{})};
  validateLedgerConfiguration(configuration);
  payablePolicyReferences({configuration,policy,organizationId,financeEntityId,actor:'configuration_validation',postedAt:new Date().toISOString()});
  // Catalog revision and old configuration version are included. Configuration
  // is rebuilt server-side on confirmation; the browser never submits a chart.
  const material={organizationId,financeEntityId,input,configuration,policy,catalog:catalog.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))};
  const proposalHash=bookId(canonicalStringify(material));
  return {configuration,policy,configRef,policyRef,proposalHash,previousVersion:previous?.version??0,openingAccounts,categoryOptions};
}
