export type TodayOperationalBalance =
  | { state: 'available'; amountCents: number; reason: null }
  | { state: 'unavailable'; amountCents: null; reason: 'no_asset_accounts' | 'opening_balance_incomplete' | 'unsupported_adjustments' };

export type TodayOperationalSnapshot = {
  localDate: string;
  incomeCents: number;
  expenseCents: number;
  dueSoonCount: number;
  dueSoonTruncated: boolean;
  balance: TodayOperationalBalance;
  source: {
    deterministic: true;
    aiUsedForTotals: false;
    dueDatesMayComeFromReviewedOrProposedDocumentAnalysis: true;
    balanceUsesPostedTransactionsOnly: true;
  };
};

export function buildTodayOperationalBalance(input: {
  activeAssetAccounts: Array<{ openingBalanceCents: unknown }>;
  postedIncomeCents: number;
  postedExpenseCents: number;
  postedLiabilitySettlementCents: number;
  postedAdjustmentCount: number;
}): TodayOperationalBalance {
  if (input.activeAssetAccounts.length === 0) {
    return { state: 'unavailable', amountCents: null, reason: 'no_asset_accounts' };
  }
  if (input.activeAssetAccounts.some((account) => !Number.isSafeInteger(Number(account.openingBalanceCents)))) {
    return { state: 'unavailable', amountCents: null, reason: 'opening_balance_incomplete' };
  }
  if (input.postedAdjustmentCount > 0) {
    return { state: 'unavailable', amountCents: null, reason: 'unsupported_adjustments' };
  }
  const opening = input.activeAssetAccounts.reduce(
    (sum, account) => sum + Number(account.openingBalanceCents),
    0,
  );
  return {
    state: 'available',
    amountCents:
      opening +
      input.postedIncomeCents -
      input.postedExpenseCents -
      input.postedLiabilitySettlementCents,
    reason: null,
  };
}
