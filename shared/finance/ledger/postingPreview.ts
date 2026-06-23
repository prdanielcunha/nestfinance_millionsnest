import { createHash } from 'crypto';
import { LedgerTransaction } from './transaction.js';
import { FinanceAllocation } from './allocation.js';
import { PostingMappingSnapshot, PostingPreviewPolicy } from './postingMappings.js';
import { LedgerAccountId } from './ids.js';
import { assertAmountCents, sumAmountCents } from './money.js';

export type PostingPreviewLine = {
  organizationId: string;
  financeEntityId: string;
  ledgerAccountId: LedgerAccountId;
  debitCents: number;
  creditCents: number;
  fundId?: string;
  categoryId?: string;
  costCenterId?: string;
  sequence: number;
  allocationId?: string;
};

export type PostingBlockerCode =
  | 'ACCOUNT_LEDGER_MAPPING_MISSING'
  | 'CATEGORY_LEDGER_MAPPING_MISSING'
  | 'CATEGORY_KIND_MISMATCH'
  | 'ALLOCATION_TOTAL_MISMATCH'
  | 'LEDGER_ACCOUNT_INACTIVE'
  | 'LEDGER_ACCOUNT_POSTING_DISABLED'
  | 'CROSS_ENTITY_REFERENCE'
  | 'TRANSACTION_NOT_READY_FOR_REVIEW'
  | 'POSTING_DIRECTION_NOT_SUPPORTED'
  | 'JOURNAL_UNBALANCED'
  | 'FINANCE_PERIOD_CLOSED';

export type PostingBlocker = {
  code: PostingBlockerCode;
  resourceId?: string;
  resourceType?: string;
  field?: string;
  details?: string;
};

export type PostingPreviewInput = {
  transaction: LedgerTransaction;
  allocations: FinanceAllocation[];
  mappings: PostingMappingSnapshot;
  policy: PostingPreviewPolicy;
};

export type PostingPreviewResult =
  | {
      ready: true;
      debitTotalCents: number;
      creditTotalCents: number;
      lines: PostingPreviewLine[];
      sourceHash: string;
    }
  | {
      ready: false;
      blockers: PostingBlocker[];
    };

// Deterministic lexical comparator without localeCompare
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

export function computePostingPreviewSourceHash(data: string): string {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex.toLowerCase()}`;
}

export function comparePreviewLines(a: PostingPreviewLine, b: PostingPreviewLine): number {
  const aIsDebit = a.debitCents > 0;
  const bIsDebit = b.debitCents > 0;
  if (aIsDebit !== bIsDebit) {
    return aIsDebit ? -1 : 1;
  }
  
  if (a.sequence !== b.sequence) {
    return a.sequence - b.sequence;
  }

  if (a.ledgerAccountId !== b.ledgerAccountId) {
    return compareCanonicalId(a.ledgerAccountId, b.ledgerAccountId);
  }

  const aCat = a.categoryId || '';
  const bCat = b.categoryId || '';
  if (aCat !== bCat) {
    return compareCanonicalId(aCat, bCat);
  }

  const aFund = a.fundId || '';
  const bFund = b.fundId || '';
  if (aFund !== bFund) {
    return compareCanonicalId(aFund, bFund);
  }

  const aAlloc = a.allocationId || '';
  const bAlloc = b.allocationId || '';
  if (aAlloc !== bAlloc) {
    return compareCanonicalId(aAlloc, bAlloc);
  }

  const aCost = a.costCenterId || '';
  const bCost = b.costCenterId || '';
  if (aCost !== bCost) {
    return compareCanonicalId(aCost, bCost);
  }

  if (a.debitCents !== b.debitCents) {
    return a.debitCents - b.debitCents;
  }

  if (a.creditCents !== b.creditCents) {
    return a.creditCents - b.creditCents;
  }

  return 0;
}

export function compareBlockers(a: PostingBlocker, b: PostingBlocker): number {
  if (a.code !== b.code) {
    return compareCanonicalId(a.code, b.code);
  }
  const aType = a.resourceType || '';
  const bType = b.resourceType || '';
  if (aType !== bType) {
    return compareCanonicalId(aType, bType);
  }
  const aId = a.resourceId || '';
  const bId = b.resourceId || '';
  if (aId !== bId) {
    return compareCanonicalId(aId, bId);
  }
  const aField = a.field || '';
  const bField = b.field || '';
  if (aField !== bField) {
    return compareCanonicalId(aField, bField);
  }
  const aDetails = a.details || '';
  const bDetails = b.details || '';
  if (aDetails !== bDetails) {
    return compareCanonicalId(aDetails, bDetails);
  }
  return 0;
}

export function generatePostingPreview(input: PostingPreviewInput): PostingPreviewResult {
  const { transaction: tx, allocations, mappings, policy } = input;
  const blockers: PostingBlocker[] = [];

  // ID Formats
  if (!isValidId(tx.id)) {
    blockers.push({ code: 'TRANSACTION_NOT_READY_FOR_REVIEW', resourceId: tx.id, details: 'Invalid transaction ID format' });
  }
  if (!isValidId(tx.organizationId)) {
    blockers.push({ code: 'CROSS_ENTITY_REFERENCE', resourceId: tx.organizationId, details: 'Invalid organization ID format' });
  }
  if (!isValidId(tx.financeEntityId)) {
    blockers.push({ code: 'CROSS_ENTITY_REFERENCE', resourceId: tx.financeEntityId, details: 'Invalid finance entity ID format' });
  }

  if (tx.status !== 'ready_for_review') {
    blockers.push({ code: 'TRANSACTION_NOT_READY_FOR_REVIEW' });
  }

  if (tx.transactionKind !== 'income' && tx.transactionKind !== 'expense') {
    blockers.push({ code: 'POSTING_DIRECTION_NOT_SUPPORTED' });
  }

  // Set to avoid duplicates
  const seenAllocIds = new Set<string>();
  const seenAllocSeqs = new Set<number>();

  for (const alloc of allocations) {
    if (!alloc.id || !isValidId(alloc.id)) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', resourceId: alloc.id || '', details: 'Invalid allocation ID format' });
    } else if (seenAllocIds.has(alloc.id)) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', resourceId: alloc.id, details: 'Duplicate allocation ID' });
    } else {
      seenAllocIds.add(alloc.id);
    }

    if (alloc.sequence === undefined || alloc.sequence === null || !Number.isInteger(alloc.sequence)) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', resourceId: alloc.id || '', details: 'Invalid allocation sequence' });
    } else if (seenAllocSeqs.has(alloc.sequence)) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', resourceId: alloc.id || '', details: 'Duplicate allocation sequence' });
    } else {
      seenAllocSeqs.add(alloc.sequence);
    }

    if (alloc.organizationId !== tx.organizationId || alloc.financeEntityId !== tx.financeEntityId) {
      blockers.push({ code: 'CROSS_ENTITY_REFERENCE', resourceId: alloc.id });
    }
  }

  try {
    assertAmountCents(tx.amountCents);
    if (tx.amountCents <= 0 && tx.transactionKind !== 'adjustment') {
      blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Transaction amount must be strictly positive' });
    }
  } catch (e) {
    blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Invalid transaction amount' });
  }

  for (const alloc of allocations) {
    try {
      assertAmountCents(alloc.amountCents);
      if (alloc.amountCents <= 0) {
        blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Allocation amount must be strictly positive' });
      }
    } catch (e) {
      blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Invalid allocation amount' });
    }
  }

  let allocSum = 0;
  try {
    allocSum = sumAmountCents(allocations.map(a => a.amountCents));
  } catch (e) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Invalid allocation amounts' });
  }

  if (allocSum !== tx.amountCents) {
    blockers.push({ code: 'ALLOCATION_TOTAL_MISMATCH', details: 'Sum of allocations differs from transaction total' });
  }

  const seenCategories = new Map<string, { ledgerAccountId: string; kind: string }>();

  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') {
    const mainAcc = mappings.operationalAccount;
    if (!mainAcc || !mainAcc.accountId || !isValidId(mainAcc.accountId)) {
      blockers.push({ code: 'ACCOUNT_LEDGER_MAPPING_MISSING', details: 'Invalid or missing operational account identification' });
    } else if (!tx.accountId || mainAcc.accountId !== tx.accountId) {
      blockers.push({ code: 'ACCOUNT_LEDGER_MAPPING_MISSING', resourceId: tx.accountId });
    }

    if (mainAcc && (!mainAcc.assetLedgerAccountId || !isValidId(mainAcc.assetLedgerAccountId))) {
      blockers.push({ code: 'ACCOUNT_LEDGER_MAPPING_MISSING', details: 'Invalid asset ledger account ID' });
    }

    for (const alloc of allocations) {
      // Find within mapping snapshot
      const categoryMappings = mappings.categories.filter(c => c.categoryId === alloc.categoryId);
      if (categoryMappings.length === 0) {
        blockers.push({ code: 'CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId });
      } else if (categoryMappings.length > 1) {
        const uniqueDests = new Set(categoryMappings.map(m => m.ledgerAccountId));
        const uniqueKinds = new Set(categoryMappings.map(m => m.kind));
        if (uniqueDests.size > 1 || uniqueKinds.size > 1) {
          blockers.push({ code: 'CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId, details: 'Conflicting mappings found for category' });
        } else {
          blockers.push({ code: 'CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId, details: 'Duplicate mapping entry found for category' });
        }
      } else {
        const catMapping = categoryMappings[0];
        if (!catMapping.ledgerAccountId || !isValidId(catMapping.ledgerAccountId)) {
          blockers.push({ code: 'CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId, details: 'Ledger account ID cannot be empty in category mapping' });
        }
        if (catMapping.kind !== tx.transactionKind) {
          blockers.push({ code: 'CATEGORY_KIND_MISMATCH', resourceId: alloc.categoryId });
        }
      }
    }
  }

  // Ledger account checks
  const validateLedgerAccount = (accountId: string, resourceContext: string) => {
    if (!accountId || !isValidId(accountId)) {
      blockers.push({ code: 'LEDGER_ACCOUNT_INACTIVE', resourceId: accountId || '', details: 'Invalid ledger account ID' });
      return;
    }
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

  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') {
    if (tx.accountId && mappings.operationalAccount && mappings.operationalAccount.accountId === tx.accountId) {
      validateLedgerAccount(mappings.operationalAccount.assetLedgerAccountId, `Operational account mapping`);
    }

    for (const alloc of allocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId);
      if (catMapping) {
        validateLedgerAccount(catMapping.ledgerAccountId, `Category mapping for ${alloc.categoryId}`);
      }
    }
  }

  if (blockers.length > 0) {
    const unique = Array.from(new Set(blockers.map(b => JSON.stringify(b)))).map(s => JSON.parse(s));
    const sortedUnique = (unique as PostingBlocker[]).sort(compareBlockers);
    return { ready: false, blockers: sortedUnique };
  }

  const lines: PostingPreviewLine[] = [];

  if (tx.transactionKind === 'income') {
    lines.push({
      organizationId: tx.organizationId,
      financeEntityId: tx.financeEntityId,
      ledgerAccountId: mappings.operationalAccount.assetLedgerAccountId,
      debitCents: tx.amountCents,
      creditCents: 0,
      sequence: 0,
    });

    for (const alloc of allocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId)!;
      lines.push({
        organizationId: tx.organizationId,
        financeEntityId: tx.financeEntityId,
        ledgerAccountId: catMapping.ledgerAccountId,
        debitCents: 0,
        creditCents: alloc.amountCents,
        fundId: alloc.fundId,
        categoryId: alloc.categoryId,
        costCenterId: alloc.costCenterId,
        sequence: 0,
        allocationId: alloc.id
      });
    }
  } else if (tx.transactionKind === 'expense') {
    for (const alloc of allocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId)!;
      lines.push({
        organizationId: tx.organizationId,
        financeEntityId: tx.financeEntityId,
        ledgerAccountId: catMapping.ledgerAccountId,
        debitCents: alloc.amountCents,
        creditCents: 0,
        fundId: alloc.fundId,
        categoryId: alloc.categoryId,
        costCenterId: alloc.costCenterId,
        sequence: 0,
        allocationId: alloc.id
      });
    }

    lines.push({
      organizationId: tx.organizationId,
      financeEntityId: tx.financeEntityId,
      ledgerAccountId: mappings.operationalAccount.assetLedgerAccountId,
      debitCents: 0,
      creditCents: tx.amountCents,
      sequence: 0,
    });
  }

  lines.sort(comparePreviewLines);

  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of lines) {
    if (line.debitCents > 0 && line.creditCents > 0) {
      blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Simultaneous debit and credit in the same line' });
    }
    if (line.debitCents < 0 || line.creditCents < 0) {
      blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Negative value in journal line' });
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Line with both zero debit and zero credit' });
    }
    totalDebits += line.debitCents;
    totalCredits += line.creditCents;
  }

  if (totalDebits !== totalCredits) {
    blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Totals mismatch' });
  }

  if (totalDebits === 0) {
    blockers.push({ code: 'JOURNAL_UNBALANCED', details: 'Zero total journal' });
  }

  if (blockers.length > 0) {
    const unique = Array.from(new Set(blockers.map(b => JSON.stringify(b)))).map(s => JSON.parse(s));
    const sortedUnique = (unique as PostingBlocker[]).sort(compareBlockers);
    return { ready: false, blockers: sortedUnique };
  }

  lines.forEach((line, i) => {
    line.sequence = i + 1;
  });

  // Calculate Fingerprint using only material data, in a snoop-free manner
  const materialSource = {
    version: tx.version,
    organizationId: tx.organizationId,
    financeEntityId: tx.financeEntityId,
    transactionId: tx.id,
    direction: tx.transactionKind,
    status: tx.status,
    amountCents: tx.amountCents,
    currency: tx.currency || 'BRL',
    occurredAt: tx.occurredAt,
    competenceDate: tx.competenceDate || tx.occurredAt || '',
    entryDate: (tx as any).entryDate || tx.recordedAt || tx.occurredAt || '',
    accountId: (tx as any).accountId || '',
    allocations: allocations.map(a => ({
      id: a.id,
      categoryId: a.categoryId,
      amountCents: a.amountCents,
      sequence: a.sequence,
      fundId: a.fundId,
      costCenterId: a.costCenterId
    })).sort((a, b) => compareCanonicalId(a.id, b.id)),
    mappings: {
      operationalAccount: {
        accountId: mappings.operationalAccount.accountId,
        assetLedgerAccountId: mappings.operationalAccount.assetLedgerAccountId
      },
      categories: mappings.categories.map(c => ({
        categoryId: c.categoryId,
        ledgerAccountId: c.ledgerAccountId,
        kind: c.kind
      })).sort((a, b) => compareCanonicalId(a.categoryId, b.categoryId))
    },
    policy: {
      ledgerAccounts: policy.ledgerAccounts.map(la => ({
         id: la.id,
         organizationId: la.organizationId,
         financeEntityId: la.financeEntityId,
         active: la.active,
         postingAllowed: la.postingAllowed
      })).sort((a, b) => compareCanonicalId(a.id, b.id))
    },
    lines: lines.map(l => ({
      organizationId: l.organizationId,
      financeEntityId: l.financeEntityId,
      ledgerAccountId: l.ledgerAccountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      fundId: l.fundId,
      categoryId: l.categoryId,
      costCenterId: l.costCenterId,
      sequence: l.sequence,
      allocationId: l.allocationId
    }))
  };

  const canonicalString = canonicalStringify(materialSource);
  const sourceHash = computePostingPreviewSourceHash(canonicalString);

  return {
    ready: true,
    debitTotalCents: totalDebits,
    creditTotalCents: totalCredits,
    lines,
    sourceHash
  };
}
