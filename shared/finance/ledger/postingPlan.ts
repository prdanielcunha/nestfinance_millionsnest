import { createHash } from 'crypto';
import { LedgerTransaction, IncomeTransaction, ExpenseTransaction, TransferTransaction, LiabilitySettlementTransaction } from './transaction.js';
import { FinanceAllocation } from './allocation.js';
import { PostingMappingSnapshot, PostingPreviewPolicy } from './postingMappings.js';
import { LedgerAccountId } from './ids.js';
import { assertAmountCents, sumAmountCents } from './money.js';

export type PostingPlanLine = {
  lineKey: string;
  ledgerAccountId: LedgerAccountId;
  debitCents: number;
  creditCents: number;
  financeAccountId?: string;
  categoryId?: string;
  fundId?: string;
  allocationId?: string;
  memo?: string;
};

export type AccountEffectProjection = {
  financeAccountId: string;
  effect: 'increase' | 'decrease';
  amountCents: number;
  reason:
    | 'income_received'
    | 'expense_paid'
    | 'transfer_source'
    | 'transfer_destination'
    | 'liability_created'
    | 'liability_settled';
};

export type FundEffectProjection = {
  fundId: string;
  effect: 'increase' | 'decrease' | 'transfer_in' | 'transfer_out' | 'none';
  amountCents: number;
};

export type PostingPlanIssueCode =
  | 'FINANCE_ACCOUNT_LEDGER_MAPPING_MISSING'
  | 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING'
  | 'CATEGORY_KIND_MISMATCH'
  | 'ALLOCATION_TOTAL_MISMATCH'
  | 'LEDGER_ACCOUNT_INACTIVE'
  | 'LEDGER_ACCOUNT_POSTING_DISABLED'
  | 'CROSS_ENTITY_REFERENCE'
  | 'FINANCE_APPROVAL_STALE'
  | 'FINANCE_APPROVAL_INVALIDATED'
  | 'FINANCE_TRANSACTION_ALREADY_POSTED'
  | 'FINANCE_POSTING_PLAN_UNBALANCED'
  | 'POSTING_DIRECTION_NOT_SUPPORTED';

export type PostingPlanIssue = {
  code: PostingPlanIssueCode;
  resourceId?: string;
  resourceType?: string;
  field?: string;
  details?: string;
};

export type PostingPlan = {
  planVersion: string;
  transactionId: string;
  organizationId: string;
  financeEntityId: string;
  transactionKind: 'income' | 'expense' | 'transfer' | 'liability_settlement' | 'adjustment';
  approvedVersion: number;
  approvalSourceHash: string;
  
  journalEntry: {
    entryDate: string;
    description: string;
    referenceType: 'finance_transaction';
    referenceId: string;
    lines: PostingPlanLine[];
    totalDebitCents: number;
    totalCreditCents: number;
  };

  accountEffects: AccountEffectProjection[];
  fundEffects: FundEffectProjection[];

  blockers: PostingPlanIssue[];
  warnings: PostingPlanIssue[];

  planHash: string;
};

// Deterministic lexical comparator
export function compareCanonicalId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidId(id: string): boolean {
  if (typeof id !== 'string' || id.trim() === '') return false;
  return /^[a-zA-Z0-9_\-\.\:]+$/.test(id);
}

// Canonical deterministic JSON-style stringify
export function canonicalStringify(val: any): string {
  if (val === null) return 'null';
  if (val === undefined) return '';
  if (typeof val === 'number') {
    if (Number.isNaN(val)) throw new Error('NaN is not allowed in canonical serialization');
    if (!Number.isFinite(val)) throw new Error('Infinity is not allowed in canonical serialization');
    if (!Number.isInteger(val)) throw new Error('Floats are not allowed in canonical serialization');
    return String(val);
  }
  if (typeof val === 'boolean') {
    return String(val);
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val)
      .filter(k => val[k] !== undefined)
      .sort(compareCanonicalId);
    return '{' + keys.map(k => `"${k}":${canonicalStringify(val[k])}`).join(',') + '}';
  }
  throw new Error(`Unsupported type in canonical serialization: ${typeof val}`);
}

export function computePlanHash(data: string): string {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex.toLowerCase()}`;
}

export function compareBlockers(a: PostingPlanIssue, b: PostingPlanIssue): number {
  if (a.code !== b.code) return compareCanonicalId(a.code, b.code);
  const aType = a.resourceType || '';
  const bType = b.resourceType || '';
  if (aType !== bType) return compareCanonicalId(aType, bType);
  const aId = a.resourceId || '';
  const bId = b.resourceId || '';
  if (aId !== bId) return compareCanonicalId(aId, bId);
  const aField = a.field || '';
  const bField = b.field || '';
  if (aField !== bField) return compareCanonicalId(aField, bField);
  const aDetails = a.details || '';
  const bDetails = b.details || '';
  if (aDetails !== bDetails) return compareCanonicalId(aDetails, bDetails);
  return 0;
}

export function comparePlanLines(a: PostingPlanLine, b: PostingPlanLine): number {
  const aIsDebit = a.debitCents > 0;
  const bIsDebit = b.debitCents > 0;
  if (aIsDebit !== bIsDebit) return aIsDebit ? -1 : 1; // Debits first

  // Deterministic order using lineKey
  return compareCanonicalId(a.lineKey, b.lineKey);
}

export type PostingPlanInput = {
  transaction: LedgerTransaction;
  approval?: {
    approvedVersion: number;
    approvalSourceHash: string;
    status: string; // the actual status of the approval document if any
  };
  allocations: FinanceAllocation[];
  mappings: PostingMappingSnapshot;
  policy: PostingPreviewPolicy;
  isPreview?: boolean;
};

export function buildPostingPlan(input: PostingPlanInput): PostingPlan {
  const { transaction: tx, approval, allocations, mappings, policy, isPreview } = input;
  
  const blockers: PostingPlanIssue[] = [];
  const warnings: PostingPlanIssue[] = [];

  const planVersion = '1.0';

  if (isPreview) {
    if (tx.status !== 'ready_for_review' && tx.status !== 'approved_for_posting') {
      blockers.push({ code: 'TRANSACTION_NOT_READY_FOR_REVIEW' as any });
    }
    const isUnsupported = tx.transactionKind === 'transfer' || tx.transactionKind === 'adjustment' || (tx as any).direction === 'transfer' || (tx as any).direction === 'adjustment';
    if (isUnsupported) {
      blockers.push({ code: 'POSTING_DIRECTION_NOT_SUPPORTED' as any });
    }
  } else {
    if (tx.status === 'posted') {
      blockers.push({ code: 'FINANCE_TRANSACTION_ALREADY_POSTED' });
    }

    if (tx.status !== 'approved_for_posting') {
      blockers.push({ code: 'FINANCE_APPROVAL_STALE' });
    }

    if (!approval || !tx.approvedVersion || !tx.approvalSourceHash) {
      blockers.push({ code: 'FINANCE_APPROVAL_STALE' });
    } else {
      if (tx.approvedVersion !== approval.approvedVersion) {
        blockers.push({ code: 'FINANCE_APPROVAL_STALE' });
      }
      if (tx.approvalSourceHash !== approval.approvalSourceHash) {
        blockers.push({ code: 'FINANCE_APPROVAL_STALE' });
      }
      if (approval.status === 'invalidated') {
        blockers.push({ code: 'FINANCE_APPROVAL_INVALIDATED' });
      }
    }
  }

  // Float check for transaction and allocation amounts
  if (tx.amountCents !== undefined && !Number.isInteger(tx.amountCents)) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Transaction amount must be an integer' });
  }

  // Cross-entity, float, and duplicate checks for allocations
  const allocIdSet = new Set<string>();
  let hasDuplicateAllocId = false;
  const sequenceSet = new Set<number>();
  let hasDuplicateSequence = false;

  allocations.forEach(a => {
    if (a.financeEntityId !== tx.financeEntityId || a.organizationId !== tx.organizationId) {
      blockers.push({ code: 'CROSS_ENTITY_REFERENCE' as any, resourceId: a.id, resourceType: 'allocation' });
    }
    if (a.amountCents !== undefined && !Number.isInteger(a.amountCents)) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Allocation amount must be an integer' });
    }
    if (allocIdSet.has(a.id)) {
      hasDuplicateAllocId = true;
    }
    allocIdSet.add(a.id);
    if (a.sequence !== undefined && sequenceSet.has(a.sequence)) {
      hasDuplicateSequence = true;
    }
    sequenceSet.add(a.sequence);
  });

  if (hasDuplicateAllocId) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Duplicate allocation ID' });
  }
  if (hasDuplicateSequence) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Duplicate allocation sequence' });
  }

  // Duplicate/conflicting category mappings check
  const conflictingCategories = new Set<string>();
  const categoryMap = new Map<string, string>();
  if (mappings && mappings.categories) {
    for (const cat of mappings.categories) {
      if (categoryMap.has(cat.categoryId) && categoryMap.get(cat.categoryId) !== cat.ledgerAccountId) {
        conflictingCategories.add(cat.categoryId);
      }
      categoryMap.set(cat.categoryId, cat.ledgerAccountId);
    }
  }
  for (const catId of conflictingCategories) {
    blockers.push({
      code: 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING',
      resourceId: catId,
      details: 'Conflict in mappings'
    } as any);
  }

  // Basic validation allocations
  let allocSum = 0;
  allocations.forEach(a => allocSum += a.amountCents);
  if ((tx.transactionKind === 'income' || tx.transactionKind === 'expense') && allocSum !== tx.amountCents) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH' });
  }

  const lines: PostingPlanLine[] = [];
  const accountEffects: AccountEffectProjection[] = [];
  const fundEffects: FundEffectProjection[] = [];

  const addLine = (line: PostingPlanLine) => {
    lines.push(line);
  };

  const getAccountMapping = (accountId: string) => {
    const acc = mappings.financeAccounts.find(fa => fa.accountId === accountId);
    if (!acc) {
      blockers.push({ code: 'FINANCE_ACCOUNT_LEDGER_MAPPING_MISSING', resourceId: accountId });
    }
    return acc;
  };

  const validateLedgerAccount = (accountId: string, resourceContext: string) => {
    if (!accountId) return;
    const accState = policy.ledgerAccounts.find(a => a.id === accountId);
    if (!accState) {
       blockers.push({ code: 'LEDGER_ACCOUNT_INACTIVE', resourceId: accountId, details: resourceContext });
       return;
    }
    if (accState.organizationId !== tx.organizationId || accState.financeEntityId !== tx.financeEntityId) {
      blockers.push({ code: 'CROSS_ENTITY_REFERENCE', resourceId: accountId, details: resourceContext });
    }
    if (!accState.active) {
      blockers.push({ code: 'LEDGER_ACCOUNT_INACTIVE', resourceId: accountId, details: resourceContext });
    }
    if (!accState.postingAllowed) {
      blockers.push({ code: 'LEDGER_ACCOUNT_POSTING_DISABLED', resourceId: accountId, details: resourceContext });
    }
  };

  if (tx.transactionKind === 'income') {
    const incomeTx = tx as IncomeTransaction;
    const accMap = getAccountMapping(incomeTx.accountId);
    
    if (accMap) {
      validateLedgerAccount(accMap.ledgerAccountId, 'Income account mapping');
      addLine({
        lineKey: `asset_${incomeTx.accountId}`,
        ledgerAccountId: accMap.ledgerAccountId,
        debitCents: tx.amountCents,
        creditCents: 0,
        financeAccountId: incomeTx.accountId
      });
      accountEffects.push({
        financeAccountId: incomeTx.accountId,
        effect: 'increase',
        amountCents: tx.amountCents,
        reason: 'income_received'
      });
    }

    const sortedAllocations = [...allocations].sort((a, b) => compareCanonicalId(a.id, b.id));
    for (const alloc of sortedAllocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId);
      if (!catMapping) {
        blockers.push({ code: 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId });
      } else {
        if (catMapping.kind !== 'income') blockers.push({ code: 'CATEGORY_KIND_MISMATCH', resourceId: alloc.categoryId });
        validateLedgerAccount(catMapping.ledgerAccountId, `Category mapping for ${alloc.categoryId}`);
        
        addLine({
          lineKey: `income_${alloc.id}`,
          ledgerAccountId: catMapping.ledgerAccountId,
          debitCents: 0,
          creditCents: alloc.amountCents,
          categoryId: alloc.categoryId,
          fundId: alloc.fundId,
          allocationId: alloc.id
        });
      }
      
      if (alloc.fundId) {
        fundEffects.push({
          fundId: alloc.fundId,
          effect: 'increase',
          amountCents: alloc.amountCents
        });
      }
    }

  } else if (tx.transactionKind === 'expense') {
    const expenseTx = tx as ExpenseTransaction;
    const isReimbursement = !!expenseTx.reimbursement;
    
    // Sort allocations deterministically
    const sortedAllocations = [...allocations].sort((a, b) => compareCanonicalId(a.id, b.id));
    
    for (const alloc of sortedAllocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId);
      if (!catMapping) {
        blockers.push({ code: 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId });
      } else {
        if (catMapping.kind !== 'expense') blockers.push({ code: 'CATEGORY_KIND_MISMATCH', resourceId: alloc.categoryId });
        validateLedgerAccount(catMapping.ledgerAccountId, `Category mapping for ${alloc.categoryId}`);
        
        addLine({
          lineKey: `expense_${alloc.id}`,
          ledgerAccountId: catMapping.ledgerAccountId,
          debitCents: alloc.amountCents,
          creditCents: 0,
          categoryId: alloc.categoryId,
          fundId: alloc.fundId,
          allocationId: alloc.id
        });
      }
      
      if (alloc.fundId) {
        fundEffects.push({
          fundId: alloc.fundId,
          effect: 'decrease',
          amountCents: alloc.amountCents
        });
      }
    }

    if (isReimbursement) {
      // Reembolso a pagar (Passivo)
      // We assume reimbursement liability account is implicitly configured or we find it.
      // But the mappings have to tell us.
      // Wait, mappings.financeAccounts could represent the "reimbursement payable" if it's modeled as a liability account.
      // For now, let's look for a liability account that matches the reimbursement payableId.
      const accMap = getAccountMapping(expenseTx.reimbursement!.payableId);
      if (accMap) {
        validateLedgerAccount(accMap.ledgerAccountId, 'Liability account mapping');
        addLine({
          lineKey: `liability_${expenseTx.reimbursement!.payableId}`,
          ledgerAccountId: accMap.ledgerAccountId,
          debitCents: 0,
          creditCents: tx.amountCents,
          financeAccountId: expenseTx.reimbursement!.payableId
        });
        accountEffects.push({
          financeAccountId: expenseTx.reimbursement!.payableId,
          effect: 'increase',
          amountCents: tx.amountCents,
          reason: 'liability_created'
        });
      }
    } else {
      const accMap = getAccountMapping(expenseTx.accountId);
      if (accMap) {
        validateLedgerAccount(accMap.ledgerAccountId, 'Expense account mapping');
        addLine({
          lineKey: `asset_${expenseTx.accountId}`,
          ledgerAccountId: accMap.ledgerAccountId,
          debitCents: 0,
          creditCents: tx.amountCents,
          financeAccountId: expenseTx.accountId
        });
        
        // If it's a credit card, it's a liability increasing. Otherwise it's an asset decreasing.
        if (accMap.type === 'liability') {
          accountEffects.push({
            financeAccountId: expenseTx.accountId,
            effect: 'increase',
            amountCents: tx.amountCents,
            reason: 'liability_created' // Expense on credit card increases liability
          });
        } else {
          accountEffects.push({
            financeAccountId: expenseTx.accountId,
            effect: 'decrease',
            amountCents: tx.amountCents,
            reason: 'expense_paid'
          });
        }
      }
    }

  } else if (tx.transactionKind === 'transfer') {
    const transferTx = tx as TransferTransaction;
    const sourceAcc = getAccountMapping(transferTx.sourceAccountId);
    const destAcc = getAccountMapping(transferTx.destinationAccountId);

    if (sourceAcc) {
      validateLedgerAccount(sourceAcc.ledgerAccountId, 'Transfer source mapping');
      addLine({
        lineKey: `transfer_out_${transferTx.sourceAccountId}`,
        ledgerAccountId: sourceAcc.ledgerAccountId,
        debitCents: 0,
        creditCents: tx.amountCents,
        financeAccountId: transferTx.sourceAccountId
      });
      accountEffects.push({
        financeAccountId: transferTx.sourceAccountId,
        effect: 'decrease',
        amountCents: tx.amountCents,
        reason: 'transfer_source'
      });
    }

    if (destAcc) {
      validateLedgerAccount(destAcc.ledgerAccountId, 'Transfer dest mapping');
      addLine({
        lineKey: `transfer_in_${transferTx.destinationAccountId}`,
        ledgerAccountId: destAcc.ledgerAccountId,
        debitCents: tx.amountCents,
        creditCents: 0,
        financeAccountId: transferTx.destinationAccountId
      });
      accountEffects.push({
        financeAccountId: transferTx.destinationAccountId,
        effect: 'increase',
        amountCents: tx.amountCents,
        reason: 'transfer_destination'
      });
    }

  } else if (tx.transactionKind === 'liability_settlement') {
    const settlementTx = tx as LiabilitySettlementTransaction;
    const sourceAcc = getAccountMapping(settlementTx.sourceAccountId);
    const liabilityAcc = getAccountMapping(settlementTx.liabilityAccountId);

    if (liabilityAcc) {
      validateLedgerAccount(liabilityAcc.ledgerAccountId, 'Liability settlement mapping');
      addLine({
        lineKey: `settle_liability_${settlementTx.liabilityAccountId}`,
        ledgerAccountId: liabilityAcc.ledgerAccountId,
        debitCents: tx.amountCents,
        creditCents: 0,
        financeAccountId: settlementTx.liabilityAccountId
      });
      accountEffects.push({
        financeAccountId: settlementTx.liabilityAccountId,
        effect: 'decrease',
        amountCents: tx.amountCents,
        reason: 'liability_settled'
      });
    }

    if (sourceAcc) {
      validateLedgerAccount(sourceAcc.ledgerAccountId, 'Settlement source mapping');
      addLine({
        lineKey: `settle_asset_${settlementTx.sourceAccountId}`,
        ledgerAccountId: sourceAcc.ledgerAccountId,
        debitCents: 0,
        creditCents: tx.amountCents,
        financeAccountId: settlementTx.sourceAccountId
      });
      accountEffects.push({
        financeAccountId: settlementTx.sourceAccountId,
        effect: 'decrease',
        amountCents: tx.amountCents,
        reason: 'expense_paid'
      });
    }
  } else {
    blockers.push({ code: 'POSTING_DIRECTION_NOT_SUPPORTED' });
  }

  lines.sort(comparePlanLines);

  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of lines) {
    if (line.debitCents > 0 && line.creditCents > 0) {
      blockers.push({ code: 'FINANCE_POSTING_PLAN_UNBALANCED', details: 'Simultaneous debit and credit in the same line' });
    }
    if (line.debitCents < 0 || line.creditCents < 0) {
      blockers.push({ code: 'FINANCE_POSTING_PLAN_UNBALANCED', details: 'Negative value in journal line' });
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      blockers.push({ code: 'FINANCE_POSTING_PLAN_UNBALANCED', details: 'Line with both zero debit and zero credit' });
    }
    totalDebits += line.debitCents;
    totalCredits += line.creditCents;
  }

  if (lines.length > 0 && totalDebits !== totalCredits) {
    blockers.push({ code: 'FINANCE_POSTING_PLAN_UNBALANCED', details: 'Totals mismatch' });
  }

  if (blockers.length > 0) {
    const unique = Array.from(new Set(blockers.map(b => JSON.stringify(b)))).map(s => JSON.parse(s));
    blockers.splice(0, blockers.length, ...unique.sort(compareBlockers));
  }

  const materialSource: any = {
    planVersion,
    transactionId: tx.id,
    financeEntityId: tx.financeEntityId,
    occurredAt: tx.occurredAt,
    lines: lines.map(l => ({
      lineKey: l.lineKey,
      ledgerAccountId: l.ledgerAccountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      financeAccountId: l.financeAccountId,
      categoryId: l.categoryId,
      fundId: l.fundId,
      allocationId: l.allocationId
    })),
    accountEffects: accountEffects.map(e => ({
      financeAccountId: e.financeAccountId,
      effect: e.effect,
      amountCents: e.amountCents,
      reason: e.reason
    })).sort((a, b) => compareCanonicalId(a.financeAccountId, b.financeAccountId)),
    fundEffects: fundEffects.map(e => ({
      fundId: e.fundId,
      effect: e.effect,
      amountCents: e.amountCents
    })).sort((a, b) => compareCanonicalId(a.fundId, b.fundId))
  };

  const algoVer = (approval as any)?.approvalAlgorithmVersion || 1;
  if (algoVer === 1) {
    materialSource.approvedVersion = tx.approvedVersion;
    materialSource.approvalSourceHash = tx.approvalSourceHash;
    materialSource.version = tx.version;
  } else {
    materialSource.contentVersion = tx.contentVersion || 1;
  }

  let planHash = '';
  if (blockers.length === 0) {
    try {
      const canonicalString = canonicalStringify(materialSource);
      if (isPreview) console.log('DEBUG canonical:', canonicalString);
      planHash = computePlanHash(canonicalString);
    } catch (e) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Canonical serialization failed' });
    }
  }

  return {
    planVersion,
    transactionId: tx.id,
    organizationId: tx.organizationId,
    financeEntityId: tx.financeEntityId,
    transactionKind: tx.transactionKind,
    approvedVersion: tx.approvedVersion || 0,
    approvalSourceHash: tx.approvalSourceHash || '',
    journalEntry: {
      entryDate: (tx as any).entryDate || tx.occurredAt || tx.recordedAt || '',
      description: tx.description || 'Contabilização de movimentação',
      referenceType: 'finance_transaction',
      referenceId: tx.id,
      lines,
      totalDebitCents: totalDebits,
      totalCreditCents: totalCredits
    },
    accountEffects,
    fundEffects,
    blockers,
    warnings,
    planHash
  };
}

export function buildReversalPlan(originalPlan: PostingPlan): PostingPlan {
  const reversedLines = originalPlan.journalEntry.lines.map(line => ({
    ...line,
    debitCents: line.creditCents,
    creditCents: line.debitCents
  })).sort(comparePlanLines);

  const reversedAccountEffects = originalPlan.accountEffects.map(e => ({
    ...e,
    effect: e.effect === 'increase' ? 'decrease' : 'increase'
  })) as AccountEffectProjection[];

  const reversedFundEffects = originalPlan.fundEffects.map(e => {
    let newEffect = e.effect;
    if (e.effect === 'increase') newEffect = 'decrease';
    if (e.effect === 'decrease') newEffect = 'increase';
    if (e.effect === 'transfer_in') newEffect = 'transfer_out';
    if (e.effect === 'transfer_out') newEffect = 'transfer_in';
    return { ...e, effect: newEffect };
  }) as FundEffectProjection[];

  const materialSource: any = {
    planVersion: originalPlan.planVersion,
    transactionId: originalPlan.transactionId,
    financeEntityId: originalPlan.financeEntityId,
    lines: reversedLines.map(l => ({
      lineKey: l.lineKey,
      ledgerAccountId: l.ledgerAccountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      financeAccountId: l.financeAccountId,
      categoryId: l.categoryId,
      fundId: l.fundId,
      allocationId: l.allocationId
    })),
    accountEffects: reversedAccountEffects.map(e => ({
      financeAccountId: e.financeAccountId,
      effect: e.effect,
      amountCents: e.amountCents,
      reason: e.reason
    })).sort((a, b) => compareCanonicalId(a.financeAccountId, b.financeAccountId)),
    fundEffects: reversedFundEffects.map(e => ({
      fundId: e.fundId,
      effect: e.effect,
      amountCents: e.amountCents
    })).sort((a, b) => compareCanonicalId(a.fundId, b.fundId)),
    isReversal: true
  };
  // For reversals, we might just assume we don't care as much about the version exact match, or we could include contentVersion. Let's include contentVersion from original tx if available. Wait, reversal plan doesn't have approval object. Reversals are posted immediately without approval. We can omit it. But legacy hash used them.
  materialSource.approvedVersion = originalPlan.approvedVersion;
  materialSource.approvalSourceHash = originalPlan.approvalSourceHash;

  const canonicalString = canonicalStringify(materialSource);
  const planHash = computePlanHash(canonicalString);

  return {
    ...originalPlan,
    journalEntry: {
      ...originalPlan.journalEntry,
      description: `Estorno de: ${originalPlan.journalEntry.description}`,
      lines: reversedLines
    },
    accountEffects: reversedAccountEffects,
    fundEffects: reversedFundEffects,
    planHash
  };
}

export function describePostingPlan(plan: PostingPlan, context: { 
  getAccountName: (id: string) => string;
  getCategoryName: (id: string) => string;
  formatMoney: (cents: number) => string;
}): string[] {
  if (plan.blockers.length > 0) {
    return ['O plano contém bloqueios e não pode ser descrito com precisão.'];
  }

  const descriptions: string[] = [];

  for (const effect of plan.accountEffects) {
    const accName = context.getAccountName(effect.financeAccountId) || 'a conta';
    const amountStr = context.formatMoney(effect.amountCents);
    
    if (effect.reason === 'income_received') {
      descriptions.push(`${accName} receberá ${amountStr}.`);
    } else if (effect.reason === 'expense_paid') {
      descriptions.push(`${accName} será reduzida em ${amountStr}.`);
    } else if (effect.reason === 'liability_created') {
      descriptions.push(`O valor de ${amountStr} ficará como obrigação em ${accName}.`);
      if (plan.transactionKind === 'expense') {
         descriptions.push('Nenhum saldo bancário será reduzido neste momento.');
      }
    } else if (effect.reason === 'liability_settled') {
      descriptions.push(`A obrigação em ${accName} será reduzida em ${amountStr}.`);
    } else if (effect.reason === 'transfer_source') {
      descriptions.push(`${amountStr} sairão de ${accName}.`);
    } else if (effect.reason === 'transfer_destination') {
      descriptions.push(`${amountStr} entrarão em ${accName}.`);
    }
  }

  const incomeLines = plan.journalEntry.lines.filter(l => l.categoryId && l.creditCents > 0);
  const expenseLines = plan.journalEntry.lines.filter(l => l.categoryId && l.debitCents > 0);

  for (const l of incomeLines) {
    const catName = context.getCategoryName(l.categoryId!);
    descriptions.push(`A receita de ${catName} será reconhecida em ${context.formatMoney(l.creditCents)}.`);
  }

  for (const l of expenseLines) {
    const catName = context.getCategoryName(l.categoryId!);
    descriptions.push(`A despesa de ${catName} será reconhecida em ${context.formatMoney(l.debitCents)}.`);
  }

  if (plan.transactionKind === 'transfer' || plan.transactionKind === 'liability_settlement') {
    descriptions.push('Não haverá alteração em receitas ou despesas.');
  }

  return descriptions;
}

