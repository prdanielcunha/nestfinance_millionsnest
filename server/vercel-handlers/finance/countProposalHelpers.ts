import type { CountEntryType, NormalizedCountEntry } from '../../../shared/finance/count.js';
import { buildCountProposalLines, defaultCountWorkflowState, isCountWorkflowState } from '../../../shared/finance/countProposal.js';

export type CountProposalAccountOption = {
  id: string;
  name: string;
  type: string;
  nature?: string | null;
  templateKey?: string | null;
};

export type CountProposalCategoryOption = {
  id: string;
  name: string;
  kind: 'income';
};

export type CountProposalFundOption = {
  id: string;
  name: string;
};

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveCanonicalCountEntries(session: any): NormalizedCountEntry[] {
  if (!session || session.status !== 'matched') throw new Error('COUNT_PROPOSAL_REQUIRES_MATCHED_COUNT');

  const resolution = String(session.resolution?.resolvedBy || session.comparison?.resolvedBy || '');
  if (resolution === 'recount_matches_b' && Array.isArray(session.countB?.entries)) {
    return session.countB.entries;
  }
  if (resolution === 'recount_matches_a' && Array.isArray(session.countA?.entries)) {
    return session.countA.entries;
  }
  if (resolution === 'recount_matches_both' && Array.isArray(session.countA?.entries)) {
    return session.countA.entries;
  }

  if (session.comparison?.matched === true && Array.isArray(session.countA?.entries)) {
    return session.countA.entries;
  }

  if (
    Array.isArray(session.countA?.entries) &&
    Array.isArray(session.countB?.entries) &&
    session.countA.totalCents === session.countB.totalCents
  ) {
    return session.countA.entries;
  }

  throw new Error('COUNT_PROPOSAL_CANONICAL_COUNT_UNAVAILABLE');
}

function accountRank(entryType: CountEntryType, account: CountProposalAccountOption) {
  const type = normalizeText(account.type);
  const templateKey = normalizeText(account.templateKey);
  if (entryType === 'pix') {
    if (templateKey === 'church.account.checking') return 100;
    if (templateKey === 'church.account.digital_wallet') return 95;
    if (['bank_checking', 'checking'].includes(type)) return 90;
    if (['payment_account', 'digital_wallet'].includes(type)) return 85;
    if (['bank_savings', 'savings'].includes(type)) return 70;
    return 0;
  }

  if (templateKey === 'church.account.cash') return 100;
  if (['cash', 'petty_cash'].includes(type)) return 90;
  return 0;
}

function categoryRank(entryType: CountEntryType, category: CountProposalCategoryOption) {
  const name = normalizeText(category.name);
  const tokens: Record<Exclude<CountEntryType, 'pix'>, string[]> = {
    tithe: ['dizimo', 'tithe', 'diezmo'],
    offering: ['oferta', 'offering', 'ofrenda'],
    other: ['outra', 'outras', 'outro', 'other', 'otros', 'divers'],
  };

  if (entryType === 'pix') return 0;
  const matches = tokens[entryType].filter((token) => name.includes(token)).length;
  return matches > 0 ? 100 + matches : 0;
}

function bestUnique<T extends { id: string }>(items: T[], ranker: (item: T) => number): T | null {
  const ranked = items
    .map((item) => ({ item, score: ranker(item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].item;
}

export function buildCountProposalPreview(input: {
  session: any;
  accounts: CountProposalAccountOption[];
  categories: CountProposalCategoryOption[];
  funds: CountProposalFundOption[];
}) {
  const entries = resolveCanonicalCountEntries(input.session);
  const lines = buildCountProposalLines(entries);
  const incomeCategories = input.categories.filter((category) => category.kind === 'income');

  const proposalLines = lines.map((line) => {
    const suggestedAccount = bestUnique(input.accounts, (account) => accountRank(line.entryType, account));
    let suggestedCategory = bestUnique(incomeCategories, (category) => categoryRank(line.entryType, category));
    if (!suggestedCategory && line.entryType === 'pix' && incomeCategories.length === 1) {
      suggestedCategory = incomeCategories[0];
    }

    return {
      ...line,
      suggestedAccountId: suggestedAccount?.id || null,
      suggestedCategoryId: suggestedCategory?.id || null,
      missingFields: [
        ...(suggestedAccount ? [] : ['account']),
        ...(suggestedCategory ? [] : ['category']),
      ],
    };
  });

  const sourceCaptureIds = Array.from(new Set([
    input.session.countA?.sourceCaptureId,
    input.session.countB?.sourceCaptureId,
    ...(Array.isArray(input.session.recountAttempts)
      ? input.session.recountAttempts.map((attempt: any) => attempt?.sourceCaptureId)
      : []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)));

  const workflowState = isCountWorkflowState(input.session.workflowState)
    ? input.session.workflowState
    : defaultCountWorkflowState(String(input.session.status || ''));

  return {
    countSessionId: input.session.id,
    countVersion: Number(input.session.version || 0),
    serviceLabel: String(input.session.serviceLabel || ''),
    serviceDate: String(input.session.serviceDate || ''),
    workflowState,
    firstCounterLabel: input.session.countA?.countedByLabel || input.session.countA?.enteredByLabel || null,
    secondCounterLabel: input.session.countB?.countedByLabel || input.session.countB?.enteredByLabel || null,
    sourceCaptureIds,
    lines: proposalLines,
    accountOptions: input.accounts,
    categoryOptions: incomeCategories,
    fundOptions: input.funds,
    alreadyCreated: Array.isArray(input.session.countProposal?.transactionIds) && input.session.countProposal.transactionIds.length > 0,
    transactionIds: Array.isArray(input.session.countProposal?.transactionIds)
      ? input.session.countProposal.transactionIds
      : [],
  };
}
