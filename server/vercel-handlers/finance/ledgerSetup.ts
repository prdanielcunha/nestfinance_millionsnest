import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext,hasEffectiveCapability } from './accessHelpers.js';
import { buildLedgerSetupProposal,type LedgerSetupInput } from './ledgerSetupModel.js';
import { payablePolicyKey } from './payableSettlementStore.js';
import { ledgerConfigurationKey,ledgerFailure,ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookScope } from '../../../shared/finance/ledger/certifiedPosting.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
import { readLedgerState,stageCertifiedOpening } from './certifiedLedgerStore.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const b=req.body,allowed:Record<string,string[]>={status:['financeEntityId','action'],propose:['financeEntityId','action','input'],configure:['financeEntityId','action','input','proposalHash','idempotencyKey','requestId'],opening:['financeEntityId','action','accountId','expectedOpeningRevision','reason','idempotencyKey','requestId']};
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>8192||!ledgerId(b.financeEntityId)||typeof b.action!=='string'||!Object.hasOwn(allowed,b.action)||Object.keys(b).some(k=>!allowed[b.action].includes(k)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  const write=b.action==='configure'||b.action==='opening';
  if(write&&(!isValidIdempotencyKey(b.idempotencyKey)||!isValidRequestId(b.requestId)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(['propose','configure'].includes(b.action)&&(!b.input||typeof b.input!=='object'||Array.isArray(b.input)||Object.keys(b.input).some(k=>!['firstPeriod','dateBasis','feesCategoryId','discountCategoryId','language'].includes(k))))return res.status(400).json({error:'INVALID_PARAMETERS'});
  try{
    const {db,organizationId,financeEntityId,uid,context,sessionList}=await resolveFinanceRequestContext(req,'finance.manage');
    // Setup exposes opening declarations; permission is independently checked
    // even when future canonical grants separate setup from balance visibility.
    if(!hasEffectiveCapability(sessionList,'finance.balance.view'))return res.status(403).json({error:'FORBIDDEN'});
    if(b.action==='status'){
      const org=db.collection('organizations').doc(organizationId),snap=await org.collection('financeSettings').doc(ledgerConfigurationKey(financeEntityId)).get();
      if(snap.exists)assertBookScope(snap.data(),organizationId,financeEntityId);
      const accounts=await context.repository.getAccountsQuery().limit(201).get();if(accounts.size>200)ledgerFailure('LEDGER_CONFIGURATION_LIMIT');
      const rows=[];
      for(const doc of accounts.docs){const a=doc.data();assertBookScope(a,organizationId,financeEntityId);if(a.active!==true||!['asset','liability'].includes(a.nature))continue;
        rows.push({id:doc.id,name:a.name,revision:a.openingBalanceRevision??0,declaration:a.openingBalanceDeclaration??{status:'not_informed'},certified:typeof a.certifiedOpeningReceiptId==='string'});}
      const categories=await context.repository.getCategoriesQuery().limit(201).get();if(categories.size>200)ledgerFailure('LEDGER_CONFIGURATION_LIMIT');
      const categoryOptions=categories.docs.flatMap(doc=>{const c=doc.data();assertBookScope(c,organizationId,financeEntityId);return c.active===true&&['income','expense'].includes(c.kind)?[{id:doc.id,name:c.name,kind:c.kind}]:[];});
      const policy=await org.collection('financeSettings').doc(payablePolicyKey(financeEntityId)).get();if(policy.exists)assertBookScope(policy.data(),organizationId,financeEntityId);
      return res.status(200).json({configured:snap.exists,firstPeriod:snap.data()?.configuration?.firstPeriod??null,dateBasis:snap.data()?.configuration?.dateBasis??null,feesCategoryId:policy.data()?.policy?.feesCategoryId??'',discountCategoryId:policy.data()?.policy?.discountCategoryId??'',accounts:rows,categories:categoryOptions});
    }
    if(b.action==='propose'){
      const proposal=await buildLedgerSetupProposal(db,organizationId,financeEntityId,b.input as LedgerSetupInput);
      return res.status(200).json({proposalHash:proposal.proposalHash,accountCount:proposal.configuration.financeAccounts.length,categoryCount:proposal.configuration.categories.length,previousVersion:proposal.previousVersion});
    }
    const command={db,organizationId,financeEntityId,uid,requestId:b.requestId};
    const key=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'ledger_setup_'+b.action,b.idempotencyKey);
    const {idempotencyKey:_,requestId:__,...payload}=b;
    const outcome=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),key,hashPayload(payload),async t=>{
      if(b.action==='opening')return stageCertifiedOpening(t,command,b.accountId,b.expectedOpeningRevision,b.reason);
      const proposal=await buildLedgerSetupProposal(db,organizationId,financeEntityId,b.input as LedgerSetupInput,t);
      if(typeof b.proposalHash!=='string'||b.proposalHash!==proposal.proposalHash)ledgerFailure('LEDGER_SETUP_PROPOSAL_CHANGED');
      const state=await readLedgerState(t,command);
      if(state.value.revision===Number.MAX_SAFE_INTEGER)ledgerFailure('LEDGER_STATE_INVALID');
      // Existing posted sources cannot silently disappear from the new book.
      // A tenant with legacy posted records needs an explicit migration slice.
      if(proposal.previousVersion===0){
        const sources=await t.get(context.repository.getTransactionsQuery().limit(5001));
        if(sources.size>5000||sources.docs.some(d=>['posted','reversed'].includes(String(d.data().status))))ledgerFailure('LEDGER_LEGACY_POSTING_MIGRATION_REQUIRED');
        const oldBills=await t.get(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('financePayables').limit(5001));
        if(oldBills.size>5000||oldBills.docs.some(d=>{const p=d.data();assertBookScope(p,organizationId,financeEntityId);return p.paidCents!==0||['partially_paid','settled'].includes(p.status)||p.postingPerformed===true;}))ledgerFailure('LEDGER_LEGACY_POSTING_MIGRATION_REQUIRED');
      }
      t.set(proposal.configRef,{organizationId,financeEntityId,configuration:proposal.configuration,updatedByUid:uid,updatedAt:FieldValue.serverTimestamp()});
      t.set(proposal.policyRef,{organizationId,financeEntityId,policy:proposal.policy,updatedByUid:uid,updatedAt:FieldValue.serverTimestamp()});
      t.create(proposal.configRef.collection('history').doc(String(proposal.configuration.version)),{organizationId,financeEntityId,configuration:proposal.configuration,confirmedByUid:uid,confirmedAt:FieldValue.serverTimestamp(),proposalHash:proposal.proposalHash});
      t.create(proposal.policyRef.collection('history').doc(String(proposal.policy.version)),{organizationId,financeEntityId,policy:proposal.policy,confirmedByUid:uid,confirmedAt:FieldValue.serverTimestamp(),proposalHash:proposal.proposalHash});
      t.set(state.ref,{...state.value,revision:state.value.revision+1,updatedAt:FieldValue.serverTimestamp()});
      const audit=context.repository.getAuditRef().doc();stageCanonicalAuditCreate(t,db,audit,{eventId:audit.id,organizationId,financeEntityId,actor:uid,resource:'finance_settings',resourceId:proposal.configRef.id,action:'ledger.setup.confirmed',requestId:b.requestId,
        details:{versionBefore:proposal.previousVersion,versionAfter:proposal.configuration.version,proposalHash:proposal.proposalHash},createdAt:FieldValue.serverTimestamp()});
      return {configured:true,configurationVersion:proposal.configuration.version};
    });
    return res.status(200).json(outcome);
  }catch(error:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (error?.code === 'LEDGER_PERIOD_CLOSED' || String(error?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: error.code });
const code=String(error?.code||error?.error||error?.message||'');
    if(error?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
    if(error?.status===403||code.includes('FORBIDDEN')||code.includes('COUNT_TEAM'))return res.status(403).json({error:'FORBIDDEN'});
    if(code==='FINANCE_ENTITY_NOT_ACTIVE')return res.status(404).json({error:code});
    if(code.startsWith('LEDGER_')||code.startsWith('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:code.split(':')[0]});
    console.error('Ledger preparation unavailable',{code:code.slice(0,80)});return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
