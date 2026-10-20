import { createHash } from 'node:crypto';
import type { FinanceAllocation } from './allocation.js';
import { computeApprovalSourceHash } from './approvalSourceHash.js';
import { certifiedPlanReferences, ledgerDate, ledgerFailure, ledgerId, type CertifiedLedgerConfiguration } from './certifiedConfiguration.js';
import { assertJournalBalanced, type JournalEntry } from './journal.js';
import { buildPostingPlan, canonicalStringify, type PostingPlan } from './postingPlan.js';
import { validateTransactionCore, type LedgerTransaction } from './transaction.js';

export type CertifiedBookEntry = JournalEntry & {
  schemaVersion: 1;
  effectiveDate: string;
  currency: 'BRL';
  configurationVersion: number;
  referenceFingerprintHash: string;
  sourceHash: string;
  plan: PostingPlan;
  accountsSnapshot: CertifiedLedgerConfiguration['accounts'];
  integrityHash: string;
  sourceKind: 'transaction' | 'opening';
  countSourceProofHash?: string;
};

export function bookId(...parts: string[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export function assertBookScope(record: {organizationId?: unknown; financeEntityId?: unknown}, org: string, entity: string) {
  if (!record || record.organizationId !== org || record.financeEntityId !== entity) ledgerFailure('LEDGER_SCOPE_INVALID');
}
export function bookEntryHash(entry: Omit<CertifiedBookEntry, 'integrityHash'> | CertifiedBookEntry) {
  const {integrityHash: _, ...material} = entry as CertifiedBookEntry;
  return createHash('sha256').update(canonicalStringify(material)).digest('hex');
}
export function assertBookEntry(entry: CertifiedBookEntry, org: string, entity: string) {
  assertBookScope(entry,org,entity);
  if (entry.schemaVersion !== 1 || entry.currency !== 'BRL' || entry.status !== 'valid' ||
      !ledgerId(entry.id) || !Array.isArray(entry.accountsSnapshot) ||
      !entry.effectiveDate || ledgerDate(entry.effectiveDate,'UTC') !== entry.effectiveDate ||
      bookEntryHash(entry) !== entry.integrityHash) ledgerFailure('LEDGER_ENTRY_INTEGRITY_INVALID');
  assertJournalBalanced(entry);
  const chart = new Set(entry.accountsSnapshot.map(a=>a.id));
  if (entry.lines.some(l=>!chart.has(l.ledgerAccountId))) ledgerFailure('LEDGER_ENTRY_ACCOUNT_MISSING');
}

/** The seal is recomputed from persisted data. No client hash, repaired legacy
 * seal, preview status or submitted journal can grant posting authority. */
export function certifyApprovedPosting(args: {
  transaction: LedgerTransaction; allocations: FinanceAllocation[];
  approval: Record<string,any>; configuration: CertifiedLedgerConfiguration;
  organizationId: string; financeEntityId: string; actor: string; postedAt: string;
  countSourceProofHash?: string | null;
}): CertifiedBookEntry {
  const {transaction:tx,allocations,approval:a,configuration:c,organizationId:org,financeEntityId:entity} = args;
  assertBookScope(tx,org,entity);
  if (!ledgerId(tx.id) || !ledgerId(args.actor) || !Number.isSafeInteger(tx.version) || !Number.isSafeInteger(tx.contentVersion ?? 1)) ledgerFailure('LEDGER_SOURCE_INVALID');
  validateTransactionCore(tx);
  if ((tx.countSource || tx.sourceContext === 'count_session') &&
    (!tx.countSource || !/^sha256:[a-f0-9]{64}$/.test(args.countSourceProofHash || ''))) ledgerFailure('LEDGER_COUNT_SOURCE_PROOF_REQUIRED');
  if (tx.currency !== 'BRL' || tx.status !== 'approved_for_posting' || tx.journalEntryId ||
      !a || a.status !== 'approved_for_posting' || (tx as any).approvalAlgorithmVersion !== 3 || a.approvalAlgorithmVersion !== 3 ||
      !ledgerId(a.approvedBy) || a.approvedBy !== tx.approvedBy ||
      (tx as any).approvalVerificationRepair || a.approvedVersion !== tx.approvedVersion ||
      a.approvedVersion + 1 !== tx.version || a.approvedContentVersion !== (tx.contentVersion ?? 1) ||
      (tx as any).approvedContentVersion !== a.approvedContentVersion) ledgerFailure('LEDGER_REAPPROVAL_REQUIRED');
  if (!Array.isArray(allocations) || allocations.length > 100) ledgerFailure('LEDGER_ALLOCATION_INVALID');
  for (const allocation of allocations) {
    assertBookScope(allocation,org,entity);
    if (allocation.transactionId !== tx.id || !ledgerId(allocation.id) || !Number.isSafeInteger(allocation.amountCents) || allocation.amountCents <= 0) ledgerFailure('LEDGER_ALLOCATION_INVALID');
  }
  const sourceHash = computeApprovalSourceHash(tx,allocations,3);
  if (sourceHash !== a.approvalSourceHash || sourceHash !== tx.approvalSourceHash) ledgerFailure('LEDGER_APPROVAL_SOURCE_CHANGED');
  const references = certifiedPlanReferences(c,org,entity);
  if (!c.enabled || references.referenceFingerprintHash !== a.approvedReferenceFingerprintHash ||
      (tx as any).approvedReferenceFingerprintHash !== a.approvedReferenceFingerprintHash) ledgerFailure('LEDGER_APPROVAL_REFERENCES_CHANGED');
  const accountType = (id:string) => c.financeAccounts.find(m=>m.accountId===id)?.type;
  if (tx.transactionKind === 'income' && accountType(tx.accountId) !== 'asset' ||
      tx.transactionKind === 'transfer' && (accountType(tx.sourceAccountId) !== 'asset' || accountType(tx.destinationAccountId) !== 'asset') ||
      tx.transactionKind === 'liability_settlement' && (accountType(tx.sourceAccountId) !== 'asset' || accountType(tx.liabilityAccountId) !== 'liability')) ledgerFailure('LEDGER_ACCOUNT_NATURE_INVALID');
  if (!['income','expense'].includes(tx.transactionKind) && allocations.length) ledgerFailure('LEDGER_ALLOCATION_INVALID');
  // Cost centers have no canonical persistence contract yet. Losing a sealed
  // dimension during journal creation is unacceptable; reject it explicitly.
  if (allocations.some(a=>a.costCenterId)) ledgerFailure('LEDGER_COST_CENTER_NOT_SUPPORTED');
  const plan = buildPostingPlan({transaction:tx,allocations,approval:{approvedVersion:a.approvedVersion,approvalSourceHash:a.approvalSourceHash,status:a.status,approvalAlgorithmVersion:a.approvalAlgorithmVersion},...references});
  if (plan.blockers.length || !plan.planHash || plan.planHash !== a.approvedPlanHash || (tx as any).approvedPlanHash !== a.approvedPlanHash) ledgerFailure('LEDGER_APPROVAL_PLAN_CHANGED');
  // Explicitly reject unsupported payment/link schemas until their atomic
  // obligation effects are implemented. Never silently post only one side.
  if ((tx as any).payableSource || (tx as any).reimbursement) ledgerFailure('LEDGER_LINKED_OBLIGATION_NOT_SUPPORTED');
  const effectiveDate = ledgerDate(c.dateBasis === 'competence_date' ? tx.competenceDate || tx.occurredAt : tx.occurredAt,c.timeZone);
  if (effectiveDate.slice(0,7) < c.firstPeriod) ledgerFailure('LEDGER_DATE_BEFORE_FIRST_PERIOD');
  const id = 'je_' + bookId(org,entity,tx.id);
  const base: Omit<CertifiedBookEntry,'integrityHash'> = {
    id,organizationId:org,financeEntityId:entity,sourceTransactionId:tx.id,
    description:tx.description || 'Finance transaction',postedAt:args.postedAt,postedBy:args.actor,status:'valid',
    schemaVersion:1,sourceKind:'transaction',effectiveDate,currency:'BRL',configurationVersion:c.version,
    ...(args.countSourceProofHash ? {countSourceProofHash:args.countSourceProofHash} : {}),
    referenceFingerprintHash:references.referenceFingerprintHash,sourceHash,plan,
    accountsSnapshot:c.accounts.map(a=>({...a})),
    lines:plan.journalEntry.lines.map((line,i)=>({
      id:'jl_'+bookId(id,line.lineKey),organizationId:org,financeEntityId:entity,journalEntryId:id,
      ledgerAccountId:line.ledgerAccountId,debitCents:line.debitCents,creditCents:line.creditCents,
      sequence:i+1,...(line.fundId?{fundId:line.fundId}:{}),...(line.categoryId?{categoryId:line.categoryId}:{}),
    })),
  };
  // Remove optional undefined properties before hashing and persistence.
  const normalized = JSON.parse(JSON.stringify(base));
  const entry = {...normalized,integrityHash:bookEntryHash(normalized)} as CertifiedBookEntry;
  assertBookEntry(entry,org,entity);
  return entry;
}

/** Invert the immutable original, even if the current chart has changed. */
export function certifyReversal(original: CertifiedBookEntry, args: {actor:string;postedAt:string;effectiveDate:string;reason:string}) {
  assertBookEntry(original,original.organizationId,original.financeEntityId);
  if (original.sourceKind !== 'transaction' || original.reversalOfEntryId || !ledgerId(args.actor) || typeof args.reason !== 'string' || args.reason.trim().length < 10 || args.reason.length > 1000) ledgerFailure('LEDGER_REVERSAL_INVALID');
  const effectiveDate = ledgerDate(args.effectiveDate,'UTC');
  if (effectiveDate < original.effectiveDate) ledgerFailure('LEDGER_REVERSAL_DATE_INVALID');
  const id = 'je_' + bookId(original.id,'reversal');
  const entry: CertifiedBookEntry = {
    ...original,id,effectiveDate,description:args.reason.trim(),postedAt:args.postedAt,postedBy:args.actor,
    reversalOfEntryId:original.id,
    lines:original.lines.map(l=>({...l,id:'jl_'+bookId(id,l.id),journalEntryId:id,debitCents:l.creditCents,creditCents:l.debitCents})),
    plan:{...original.plan,accountEffects:original.plan.accountEffects.map(e=>({...e,effect:e.effect==='increase'?'decrease':'increase'})),fundEffects:original.plan.fundEffects.map(e=>({...e,effect:({increase:'decrease',decrease:'increase',transfer_in:'transfer_out',transfer_out:'transfer_in',none:'none'} as const)[e.effect]}))},
  };
  // Plan lines must describe the reversal, not the original operation.
  entry.plan.journalEntry = {...original.plan.journalEntry,entryDate:effectiveDate,description:entry.description,
    lines:original.plan.journalEntry.lines.map(l=>({...l,debitCents:l.creditCents,creditCents:l.debitCents}))};
  entry.plan.planHash = 'sha256:'+bookId(original.integrityHash,'reversal',effectiveDate,args.reason.trim());
  entry.integrityHash = bookEntryHash(entry);
  assertBookEntry(entry,original.organizationId,original.financeEntityId);
  return entry;
}

export function certifyOpening(args:{configuration:CertifiedLedgerConfiguration;organizationId:string;financeEntityId:string;accountId:string;amountCents:number;asOf:string;actor:string;postedAt:string;declarationHash:string}):CertifiedBookEntry|null {
  const {configuration:c,organizationId:org,financeEntityId:entity,amountCents:amount,accountId}=args;
  const refs=certifiedPlanReferences(c,org,entity),mapping=c.financeAccounts.find(a=>a.accountId===accountId);
  if(!c.enabled||!mapping||!ledgerId(args.actor)||!Number.isSafeInteger(amount)||Math.abs(amount)>999_999_999_999||
    args.asOf!==c.firstPeriod+'-01'||ledgerDate(args.asOf,c.timeZone)!==args.asOf||!/^sha256:[0-9a-f]{64}$/.test(args.declarationHash))ledgerFailure('LEDGER_OPENING_INVALID');
  if(amount===0)return null; // Zero is certified by an immutable declaration receipt, never a zero journal.
  const id='je_'+bookId(org,entity,'opening',accountId),sourceTransactionId='opening_'+bookId(entity,accountId);
  const debitNet=mapping.type==='asset'?amount:-amount;
  const lines=[
    {lineKey:'opening_account',ledgerAccountId:mapping.ledgerAccountId,debitCents:Math.max(0,debitNet),creditCents:Math.max(0,-debitNet),financeAccountId:accountId},
    {lineKey:'opening_equity',ledgerAccountId:c.openingEquityAccountId,debitCents:Math.max(0,-debitNet),creditCents:Math.max(0,debitNet)},
  ];
  const plan:PostingPlan={planVersion:'1.0',transactionId:sourceTransactionId,organizationId:org,financeEntityId:entity,transactionKind:'adjustment',approvedVersion:0,approvalSourceHash:args.declarationHash,
    journalEntry:{entryDate:args.asOf,description:'Certified opening balance',referenceType:'finance_transaction',referenceId:sourceTransactionId,lines,totalDebitCents:Math.abs(amount),totalCreditCents:Math.abs(amount)},
    accountEffects:[{financeAccountId:accountId,effect:amount>0?'increase':'decrease',amountCents:Math.abs(amount),reason:mapping.type==='asset'?'income_received':'liability_created'}],fundEffects:[],blockers:[],warnings:[],planHash:'sha256:'+bookId(id,args.declarationHash,refs.referenceFingerprintHash)};
  const base:Omit<CertifiedBookEntry,'integrityHash'>={id,organizationId:org,financeEntityId:entity,sourceTransactionId,description:'Certified opening balance',postedAt:args.postedAt,postedBy:args.actor,status:'valid',schemaVersion:1,sourceKind:'opening',effectiveDate:args.asOf,currency:'BRL',configurationVersion:c.version,referenceFingerprintHash:refs.referenceFingerprintHash,sourceHash:args.declarationHash,plan,accountsSnapshot:c.accounts.map(a=>({...a})),
    lines:lines.map((l,i)=>({id:'jl_'+bookId(id,l.lineKey),organizationId:org,financeEntityId:entity,journalEntryId:id,ledgerAccountId:l.ledgerAccountId,debitCents:l.debitCents,creditCents:l.creditCents,sequence:i+1}))};
  const entry={...base,integrityHash:bookEntryHash(base)};
  assertBookEntry(entry,org,entity);
  return entry;
}
