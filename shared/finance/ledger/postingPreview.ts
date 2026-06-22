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

function stringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // ensure unsigned 32-bit hex
  return (hash >>> 0).toString(16);
}

export function generatePostingPreview(input: PostingPreviewInput): PostingPreviewResult {
  const { transaction: tx, allocations, mappings, policy } = input;
  let blockers: PostingBlocker[] = [];

  if (tx.status !== 'ready_for_review') {
    blockers.push({ code: 'TRANSACTION_NOT_READY_FOR_REVIEW' });
  }

  if (tx.direction !== 'income' && tx.direction !== 'expense') {
    blockers.push({ code: 'POSTING_DIRECTION_NOT_SUPPORTED' });
  }

  // Cross entity checks
  for (const alloc of allocations) {
    if (alloc.organizationId !== tx.organizationId || alloc.financeEntityId !== tx.financeEntityId) {
      blockers.push({ code: 'CROSS_ENTITY_REFERENCE', resourceId: alloc.id });
    }
  }

  try {
    assertAmountCents(tx.amountCents);
    if (tx.amountCents <= 0 && tx.direction !== 'adjustment') {
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

  if (tx.direction === 'income' || tx.direction === 'expense') {
    if (!tx.accountId || mappings.operationalAccount.accountId !== tx.accountId) {
      blockers.push({ code: 'ACCOUNT_LEDGER_MAPPING_MISSING', resourceId: tx.accountId });
    }

    for (const alloc of allocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId);
      if (!catMapping) {
        blockers.push({ code: 'CATEGORY_LEDGER_MAPPING_MISSING', resourceId: alloc.categoryId });
      } else {
        if (catMapping.kind !== tx.direction) {
          blockers.push({ code: 'CATEGORY_KIND_MISMATCH', resourceId: alloc.categoryId });
        }
      }
    }
  }

  // Ledger account checks
  const validateLedgerAccount = (accountId: string, resourceContext: string) => {
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

  if (tx.direction === 'income' || tx.direction === 'expense') {
    if (tx.accountId && mappings.operationalAccount.accountId === tx.accountId) {
      validateLedgerAccount(mappings.operationalAccount.assetLedgerAccountId, `Operational account mapping`);
    }

    for (const alloc of allocations) {
      const catMapping = mappings.categories.find(c => c.categoryId === alloc.categoryId);
      if (catMapping) {
        validateLedgerAccount(catMapping.ledgerAccountId, `Category mapping for ${alloc.categoryId}`);
      }
    }
  }

  // If there are existing blockers, do not attempt to build lines to avoid crashes
  if (blockers.length > 0) {
    // Unique blockers by code + resourceId easily
    const unique = Array.from(new Set(blockers.map(b => JSON.stringify(b)))).map(s => JSON.parse(s));
    return { ready: false, blockers: unique as PostingBlocker[] };
  }

  const lines: PostingPreviewLine[] = [];

  if (tx.direction === 'income') {
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
      });
    }
  } else if (tx.direction === 'expense') {
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

  lines.sort((a, b) => {
    if (a.debitCents > 0 && b.creditCents > 0) return -1;
    if (a.creditCents > 0 && b.debitCents > 0) return 1;

    if (a.ledgerAccountId !== b.ledgerAccountId) return a.ledgerAccountId.localeCompare(b.ledgerAccountId);
    if ((a.categoryId || '') !== (b.categoryId || '')) return (a.categoryId || '').localeCompare(b.categoryId || '');
    if ((a.fundId || '') !== (b.fundId || '')) return (a.fundId || '').localeCompare(b.fundId || '');
    return a.debitCents > 0 ? b.debitCents - a.debitCents : b.creditCents - a.creditCents;
  });

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
    return { ready: false, blockers: unique as PostingBlocker[] };
  }

  lines.forEach((line, i) => {
    line.sequence = i + 1;
  });

  const materializedData = {
    v: tx.version,
    l: lines.map(ls => `${ls.ledgerAccountId}:${ls.debitCents}:${ls.creditCents}:${ls.categoryId || ''}:${ls.fundId || ''}`)
  };

  const sourceHash = stringHash(JSON.stringify(materializedData));

  return {
    ready: true,
    debitTotalCents: totalDebits,
    creditTotalCents: totalCredits,
    lines,
    sourceHash
  };
}
