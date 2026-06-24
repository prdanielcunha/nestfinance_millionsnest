import { LedgerTransaction } from './transaction.js';
import { FinanceAllocation } from './allocation.js';
import { PostingMappingSnapshot, PostingPreviewPolicy } from './postingMappings.js';
import { LedgerAccountId } from './ids.js';
import { 
  buildPostingPlan, 
  canonicalStringify, 
  isValidId, 
  compareCanonicalId,
  computePlanHash,
  PostingPlanInput
} from './postingPlan.js';

export { canonicalStringify, isValidId, compareCanonicalId };

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

// Map old blocker codes to what we can
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
  code: PostingBlockerCode | string;
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

export function computePostingPreviewSourceHash(data: string): string {
  return computePlanHash(data);
}

export function generatePostingPreview(input: PostingPreviewInput): PostingPreviewResult {
  const plan = buildPostingPlan({
    transaction: input.transaction,
    allocations: input.allocations,
    mappings: input.mappings,
    policy: input.policy
  });

  if (plan.blockers.length > 0) {
    // Some basic mapping
    const mappedBlockers = plan.blockers.map(b => {
      let code = b.code as string;
      if (code === 'FINANCE_ACCOUNT_LEDGER_MAPPING_MISSING') code = 'ACCOUNT_LEDGER_MAPPING_MISSING';
      if (code === 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING') code = 'CATEGORY_LEDGER_MAPPING_MISSING';
      if (code === 'FINANCE_POSTING_PLAN_UNBALANCED') code = 'JOURNAL_UNBALANCED';
      return {
        ...b,
        code
      };
    });
    return { ready: false, blockers: mappedBlockers };
  }

  const previewLines: PostingPreviewLine[] = plan.journalEntry.lines.map((l, i) => ({
    organizationId: plan.organizationId,
    financeEntityId: plan.financeEntityId,
    ledgerAccountId: l.ledgerAccountId,
    debitCents: l.debitCents,
    creditCents: l.creditCents,
    fundId: l.fundId,
    categoryId: l.categoryId,
    allocationId: l.allocationId,
    sequence: i + 1
  }));

  return {
    ready: true,
    debitTotalCents: plan.journalEntry.totalDebitCents,
    creditTotalCents: plan.journalEntry.totalCreditCents,
    lines: previewLines,
    sourceHash: plan.planHash
  };
}
