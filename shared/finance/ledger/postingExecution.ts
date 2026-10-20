import { createHash } from 'node:crypto';
import type { LedgerTransaction } from './transaction.js';
import { validateTransactionCore } from './transaction.js';
import type { FinanceAllocation } from './allocation.js';
import { assertAllocationsTotal, validateAllocation } from './allocation.js';
import type { JournalEntry, LedgerAccountDefinition } from './journal.js';
import { assertJournalBalanced } from './journal.js';
import { buildPostingPlan, canonicalStringify, type PostingPlan } from './postingPlan.js';
import { computeApprovalSourceHash } from './approvalSourceHash.js';
import { assertAmountCents } from './money.js';
import { isValidJournalEntryId, isValidJournalLineId } from './ids.js';
import { receiptDay } from '../receivedIncome.js';
import { getCompatibility } from '../smartLogic.js';

type ScopedReference = {
  id: string; organizationId: string; financeEntityId: string;
  active: boolean; version: number;
};
export type PostingAccount = ScopedReference & {
  nature: 'asset' | 'liability'; currency: 'BRL'; ledgerMapping: string; type: string;
};
export type PostingCategory = ScopedReference & {
  kind: 'income' | 'expense'; ledgerMapping: string;
};
export type PostingFund = ScopedReference;
export type ExecutionLedgerAccount = LedgerAccountDefinition & { version: number };
export type PostingCatalog = {
  accounts: PostingAccount[]; categories: PostingCategory[];
  ledgerAccounts: ExecutionLedgerAccount[]; funds: PostingFund[];
};
export type ExecutionApproval = {
  status: string; approvedVersion: number; approvedContentVersion: number;
  approvalAlgorithmVersion: number; approvalSourceHash: string;
  approvedBy: string; approvedPlanHash: string; approvedReferenceFingerprintHash: string;
};
export type PostingExecution = {
  journal: JournalEntry; plan: PostingPlan; effectiveDay: string; period: string;
  accountDeltas: { accountId: string; deltaCents: number }[];
  referenceFingerprintHash: string;
};
function reject(code: string): never { throw Object.assign(new Error(code), { code }); }
function scoped(reference: ScopedReference, tx: LedgerTransaction) {
  if (reference.organizationId !== tx.organizationId || reference.financeEntityId !== tx.financeEntityId)
    reject('FINANCE_CROSS_ENTITY_REFERENCE');
  if (!Number.isSafeInteger(reference.version) || reference.version < 1)
    reject('FINANCE_REFERENCE_VERSION_REQUIRED');
  if (reference.active !== true) reject('FINANCE_REFERENCE_INACTIVE');
}
function findUnique<T extends { id: string }>(values: T[], id: string, code: string): T {
  const matches = values.filter(value => value.id === id);
  if (matches.length !== 1) reject(code);
  return matches[0];
}
function sumSigned(a: number, b: number) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a + b))
    reject('FINANCE_AMOUNT_OVERFLOW');
  return a + b;
}

/** Only persisted, versioned, scoped references are eligible for execution.
 * Preview-generated fallback IDs are deliberately never manufactured here. */
export function executionReferences(tx: LedgerTransaction, allocations: FinanceAllocation[], catalog: PostingCatalog) {
  const raw = tx as LedgerTransaction & { accountId?: string; sourceAccountId?: string; destinationAccountId?: string; liabilityAccountId?: string; reimbursement?: unknown };
  if (raw.reimbursement) reject('FINANCE_REIMBURSEMENT_EXECUTION_NOT_CONFIGURED');
  const accountIds = [...new Set([raw.accountId, raw.sourceAccountId, raw.destinationAccountId, raw.liabilityAccountId].filter((id): id is string => Boolean(id)))].sort();
  const accounts = accountIds.map(id => findUnique(catalog.accounts, id, 'FINANCE_ACCOUNT_NOT_CONFIGURED'));
  for (const account of accounts) {
    scoped(account, tx);
    if (account.currency !== tx.currency) reject('FINANCE_CURRENCY_MISMATCH');
    if (!['asset', 'liability'].includes(account.nature)) reject('FINANCE_ACCOUNT_NATURE_INVALID');
  }
  const account = (id?: string) => accounts.find(value => value.id === id);
  if (accounts.some(value => typeof value.type !== 'string' || !value.type)) reject('FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE');
  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') {
    const compatibility = getCompatibility(account(raw.accountId)?.type, tx.paymentMethod, tx.transactionKind);
    if (compatibility.level === 'impossible') reject('FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE');
    if (compatibility.level === 'guided_flow') reject('FINANCE_GUIDED_CASH_FLOW_REQUIRED');
  }
  if (tx.transactionKind === 'income' && account(raw.accountId)?.nature !== 'asset') reject('FINANCE_INCOME_REQUIRES_ASSET_ACCOUNT');
  if (tx.transactionKind === 'transfer' && accounts.some(value => value.nature !== 'asset')) reject('FINANCE_TRANSFER_REQUIRES_ASSET_ACCOUNTS');
  if (tx.transactionKind === 'liability_settlement' &&
      (account(raw.sourceAccountId)?.nature !== 'asset' || account(raw.liabilityAccountId)?.nature !== 'liability'))
    reject('FINANCE_SETTLEMENT_ACCOUNT_NATURE_INVALID');
  const categories = [...new Set(allocations.map(value => value.categoryId))].sort()
    .map(id => findUnique(catalog.categories, id, 'FINANCE_CATEGORY_NOT_CONFIGURED'));
  for (const category of categories) {
    scoped(category, tx);
    if (category.kind !== tx.transactionKind) reject('FINANCE_CATEGORY_KIND_MISMATCH');
  }
  const funds = [...new Set(allocations.map(value => value.fundId).filter((id): id is string => Boolean(id)))].sort()
    .map(id => findUnique(catalog.funds, id, 'FINANCE_FUND_NOT_CONFIGURED'));
  for (const fund of funds) scoped(fund, tx);
  if (allocations.some(value => value.costCenterId)) reject('FINANCE_COST_CENTER_EXECUTION_NOT_CONFIGURED');
  const ledgerIds = [...new Set([...accounts, ...categories].map(value => value.ledgerMapping))].sort();
  if (ledgerIds.some(id => typeof id !== 'string' || !id.trim())) reject('FINANCE_LEDGER_MAPPING_REQUIRED');
  const ledgerAccounts = ledgerIds.map(id => findUnique(catalog.ledgerAccounts, id, 'FINANCE_LEDGER_ACCOUNT_NOT_CONFIGURED'));
  for (const ledger of ledgerAccounts) {
    scoped(ledger, tx);
    if (ledger.postingAllowed !== true) reject('FINANCE_LEDGER_POSTING_DISABLED');
    if (ledger.normalBalance !== (['asset', 'expense'].includes(ledger.type) ? 'debit' : 'credit'))
      reject('FINANCE_LEDGER_NORMAL_BALANCE_INVALID');
  }
  for (const reference of [...accounts, ...categories]) {
    const ledger = ledgerAccounts.find(value => value.id === reference.ledgerMapping)!;
    const expected = 'nature' in reference ? reference.nature : reference.kind;
    if (ledger.type !== expected) reject('FINANCE_LEDGER_MAPPING_TYPE_MISMATCH');
  }
  const material = { accounts, categories, ledgerAccounts, funds };
  const referenceFingerprintHash = 'sha256:' + createHash('sha256').update(canonicalStringify(material)).digest('hex');
  return {
    mappings: {
      financeAccounts: accounts.map(value => ({ accountId: value.id, ledgerAccountId: value.ledgerMapping, type: value.nature })),
      categories: categories.map(value => ({ categoryId: value.id, ledgerAccountId: value.ledgerMapping, kind: value.kind })),
    },
    policy: { ledgerAccounts }, referenceFingerprintHash,
  };
}

/** Pure execution boundary. The persistence adapter must re-read all inputs and
 * the period lock within the SAME database transaction before writing. */
export function preparePostingExecution(input: {
  transaction: LedgerTransaction; allocations: FinanceAllocation[]; approval: ExecutionApproval;
  catalog: PostingCatalog; expectedVersion: number; actorUid: string; now: string;
  timezone: string; periodOpen: boolean; journalEntryId: string; journalLineIds: string[];
}): PostingExecution {
  const { transaction: tx, allocations, approval } = input;
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || tx.version !== input.expectedVersion)
    reject('FINANCE_VERSION_CONFLICT');
  if (tx.status !== 'approved_for_posting' || approval.status !== 'approved_for_posting') reject('FINANCE_APPROVAL_REQUIRED');
  if (!input.periodOpen) reject('FINANCE_PERIOD_CLOSED');
  if (tx.currency !== 'BRL') reject('FINANCE_CURRENCY_NOT_SUPPORTED');
  if (!['income', 'expense', 'transfer', 'liability_settlement'].includes(tx.transactionKind)) reject('FINANCE_EXECUTION_KIND_NOT_SUPPORTED');
  if (!tx.id || !tx.organizationId || !tx.financeEntityId || !input.actorUid.trim()) reject('FINANCE_EXECUTION_IDENTITY_REQUIRED');
  if (tx.journalEntryId) reject('FINANCE_TRANSACTION_ALREADY_POSTED');
  if (!isValidJournalEntryId(input.journalEntryId)) reject('FINANCE_INVALID_JOURNAL_ID');
  validateTransactionCore(tx); assertAmountCents(tx.amountCents);
  const effectiveDay = receiptDay(tx.occurredAt, input.timezone);
  if (!effectiveDay || !Number.isFinite(Date.parse(input.now))) reject('FINANCE_EXECUTION_DATE_INVALID');
  if (effectiveDay > (receiptDay(input.now, input.timezone) || '')) reject('FINANCE_FUTURE_EFFECTIVE_DATE');
  if (tx.contentVersion !== undefined && (!Number.isSafeInteger(tx.contentVersion) || tx.contentVersion < 1)) reject('FINANCE_CONTENT_VERSION_INVALID');
  const allocIds = new Set<string>(), sequences = new Set<number>();
  for (const allocation of allocations) {
    if (allocation.transactionId !== tx.id || allocation.organizationId !== tx.organizationId) reject('FINANCE_CROSS_ENTITY_REFERENCE');
    if (!allocation.id || allocIds.has(allocation.id) || !Number.isSafeInteger(allocation.sequence) || allocation.sequence < 1 || sequences.has(allocation.sequence)) reject('FINANCE_INVALID_ALLOCATION');
    allocIds.add(allocation.id); sequences.add(allocation.sequence);
    if (tx.transactionKind !== 'income' && tx.transactionKind !== 'expense') reject('FINANCE_UNEXPECTED_ALLOCATIONS');
    validateAllocation(allocation, tx.financeEntityId, tx.transactionKind);
  }
  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') assertAllocationsTotal(allocations, tx.amountCents);
  if (approval.approvalAlgorithmVersion !== 2 || approval.approvedContentVersion !== (tx.contentVersion || 1) ||
      !Number.isSafeInteger(approval.approvedVersion) || approval.approvedVersion < 1 || approval.approvedVersion >= tx.version ||
      approval.approvedVersion !== tx.approvedVersion || !approval.approvedBy || approval.approvedBy !== tx.approvedBy ||
      approval.approvalSourceHash !== tx.approvalSourceHash ||
      approval.approvalSourceHash !== computeApprovalSourceHash(tx, allocations, 2)) reject('FINANCE_APPROVAL_STALE');
  const references = executionReferences(tx, allocations, input.catalog);
  if (references.referenceFingerprintHash !== approval.approvedReferenceFingerprintHash) reject('FINANCE_POSTING_REFERENCES_CHANGED');
  const plan = buildPostingPlan({ transaction: tx, allocations, ...references,
    approval: { ...approval, approvalAlgorithmVersion: 2 }, isPreview: false });
  if (plan.blockers.length || !plan.planHash || plan.planHash !== approval.approvedPlanHash) reject('FINANCE_POSTING_PLAN_CHANGED');
  if (input.journalLineIds.length !== plan.journalEntry.lines.length || input.journalLineIds.some(id => !isValidJournalLineId(id))) reject('FINANCE_INVALID_JOURNAL_ID');
  const journal: JournalEntry = {
    id: input.journalEntryId, organizationId: tx.organizationId, financeEntityId: tx.financeEntityId,
    sourceTransactionId: tx.id, description: tx.description || '', postedAt: input.now,
    postedBy: input.actorUid, status: 'valid',
    lines: plan.journalEntry.lines.map((line, index) => ({
      ...line, id: input.journalLineIds[index], journalEntryId: input.journalEntryId,
      organizationId: tx.organizationId, financeEntityId: tx.financeEntityId, sequence: index + 1,
    })),
  };
  assertJournalBalanced(journal);
  const deltas = new Map<string, number>();
  for (const effect of plan.accountEffects) {
    assertAmountCents(effect.amountCents);
    deltas.set(effect.financeAccountId, sumSigned(deltas.get(effect.financeAccountId) || 0,
      effect.effect === 'increase' ? effect.amountCents : -effect.amountCents));
  }
  return { journal, plan, effectiveDay, period: effectiveDay.slice(0, 7),
    accountDeltas: [...deltas].sort(([a], [b]) => a.localeCompare(b)).map(([accountId, deltaCents]) => ({ accountId, deltaCents })),
    referenceFingerprintHash: references.referenceFingerprintHash };
}
