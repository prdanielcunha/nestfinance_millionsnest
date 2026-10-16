import {
  buildCountV3TreasuryReviewPacket,
  type CountV3TreasuryReviewPacket,
} from './countV3TreasuryReview.js';
import type { ContributionReceiptMethod } from './contributionBreakdown.js';

type ClassifiedPurpose = 'tithe' | 'offering' | 'other';

export type CountV3DraftSelection = {
  purpose: ClassifiedPurpose;
  receiptMethod: ContributionReceiptMethod;
  accountId: string;
  categoryId: string;
  fundId?: string | null;
  cardSettlementMethod?: 'credit_card' | 'debit_card';
};

export type CountV3ProposedDraftLine = CountV3DraftSelection & {
  amountCents: number;
  lineKey: string;
  ledgerPaymentMethod: string;
};

export type CountV3DraftPlan = {
  countSessionId: string;
  sourceSessionVersion: number;
  sourceRecountCycle: number;
  sourceReviewTotalCents: number;
  lines: CountV3ProposedDraftLine[];
  /** A draft has no accounting posting/finance balance mutation. */
  postingPerformed: false;
  treasuryReviewAccepted: true;
};

const PURPOSES = new Set(['tithe','offering','other']);
const METHODS = new Set(['cash','pix','card','bank_transfer','other']);
const ID_FORMAT = /^[a-zA-Z0-9_:-]{1,160}$/;

function stableKey(purpose: string, receiptMethod: string): string {
  return purpose + '|' + receiptMethod;
}
function requiredId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_FORMAT.test(value)) {
    throw new Error('COUNT_PROPOSAL_INVALID_' + field);
  }
  return value;
}

/**
 * Deterministic Count-to-finance mapping.
 *
 * Never choose accounts/categories on behalf of a church. Every nonzero
 * purpose×receipt-method dimension must have exactly one explicit target,
 * and this function does not query or write the ledger.
 *
 * This receives a *server-loaded* Count session; the authenticated handler
 * must separately check finance.review and entity scope.
 */
export function buildCountV3DraftPlan(
  session: Record<string, any>,
  selections: unknown,
): CountV3DraftPlan {
  const packet: CountV3TreasuryReviewPacket = buildCountV3TreasuryReviewPacket(session);
  if (session.treasuryReview?.status !== 'accepted') {
    throw new Error('COUNT_PROPOSAL_TREASURY_REVIEW_REQUIRED');
  }
  // The reviewer signed the immediately preceding version. Do not create
  // drafts from altered evidence or from an approval for an older cycle.
  const acceptedSourceVersion = Number(session.treasuryReview.sourceVersion);
  if (!Number.isSafeInteger(acceptedSourceVersion) || acceptedSourceVersion < 1 ||
      packet.snapshotVersion !== acceptedSourceVersion + 1) {
    throw new Error('COUNT_PROPOSAL_SOURCE_VERSION_STALE');
  }
  if (packet.requiresPurposeClassification) {
    throw new Error('COUNT_PROPOSAL_PURPOSE_CLASSIFICATION_REQUIRED');
  }
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 15) {
    throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
  }

  // Aggregate original Count lines by each distinct purpose×receipt method.
  const sums = new Map<string,{purpose:ClassifiedPurpose;receiptMethod:ContributionReceiptMethod;amountCents:number}>();
  for (const line of packet.allocations) {
    if (!PURPOSES.has(line.purpose)) throw new Error('COUNT_PROPOSAL_PURPOSE_CLASSIFICATION_REQUIRED');
    const key = stableKey(line.purpose,line.receiptMethod);
    const old = sums.get(key)?.amountCents || 0;
    const total = old + line.amountCents;
    if (!Number.isSafeInteger(total) || total > 20_000_000_000) {
      throw new Error('COUNT_PROPOSAL_TOTAL_OUT_OF_RANGE');
    }
    if (total === 0) sums.delete(key);
    else sums.set(key,{
      purpose:line.purpose as ClassifiedPurpose,
      receiptMethod:line.receiptMethod,amountCents:total,
    });
  }
  if (sums.size === 0) throw new Error('COUNT_PROPOSAL_ZERO_TOTAL');
  if (sums.size !== selections.length) throw new Error('COUNT_PROPOSAL_MISSING_REQUIRED_FIELD');

  const selectedKeys = new Set<string>();
  const planLines: CountV3ProposedDraftLine[] = selections.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
    }
    const raw=item as Record<string, unknown>;
    const purpose=String(raw.purpose || '');
    const receiptMethod=String(raw.receiptMethod || '');
    if (!PURPOSES.has(purpose) || !METHODS.has(receiptMethod)) {
      throw new Error('COUNT_PROPOSAL_INVALID_DIMENSIONS');
    }
    const key=stableKey(purpose,receiptMethod);
    const original=sums.get(key);
    if (!original || selectedKeys.has(key)) throw new Error('COUNT_PROPOSAL_DUPLICATE_OR_UNKNOWN_SELECTION');
    selectedKeys.add(key);
    const cardSettlementMethod = raw.cardSettlementMethod;
    if (receiptMethod === 'card' &&
        cardSettlementMethod !== 'credit_card' && cardSettlementMethod !== 'debit_card') {
      throw new Error('COUNT_PROPOSAL_CARD_DETAIL_REQUIRED');
    }
    if (receiptMethod !== 'card' && cardSettlementMethod !== undefined &&
        cardSettlementMethod !== null && cardSettlementMethod !== '') {
      throw new Error('COUNT_PROPOSAL_CARD_DETAIL_INCONSISTENT');
    }
    return {
      purpose:original.purpose,receiptMethod:original.receiptMethod,
      ledgerPaymentMethod: receiptMethod === 'card'
        ? cardSettlementMethod as 'credit_card' | 'debit_card'
        : original.receiptMethod,
      ...(receiptMethod === 'card'
        ? {cardSettlementMethod: cardSettlementMethod as 'credit_card' | 'debit_card'}
        : {}),
      amountCents:original.amountCents,lineKey:key,
      accountId:requiredId(raw.accountId,'ACCOUNT_ID'),
      categoryId:requiredId(raw.categoryId,'CATEGORY_ID'),
      fundId:raw.fundId === undefined || raw.fundId === null || raw.fundId === '' ? null : requiredId(raw.fundId,'FUND_ID'),
    };
  }).sort((a,b)=>a.lineKey.localeCompare(b.lineKey));

  const total = planLines.reduce((sum,line) => sum + line.amountCents,0);
  if (!Number.isSafeInteger(total) || total !== packet.countedTotalCents) {
    throw new Error('COUNT_PROPOSAL_TOTAL_MISMATCH');
  }
  return {
    countSessionId:packet.sessionId,
    sourceSessionVersion:packet.snapshotVersion,
    sourceRecountCycle:packet.recountCycle,
    sourceReviewTotalCents:total,
    lines:planLines,
    postingPerformed:false,
    treasuryReviewAccepted:true,
  };
}
