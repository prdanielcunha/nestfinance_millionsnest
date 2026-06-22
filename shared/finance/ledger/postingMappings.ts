import { LedgerAccountId } from './ids.js';

export type PostingMappingSnapshot = {
  operationalAccount: {
    accountId: string;
    assetLedgerAccountId: LedgerAccountId;
  };
  categories: Array<{
    categoryId: string;
    ledgerAccountId: LedgerAccountId;
    kind: 'income' | 'expense';
  }>;
};

export type LedgerAccountState = {
  id: LedgerAccountId;
  organizationId: string;
  financeEntityId: string;
  active: boolean;
  postingAllowed: boolean;
};

export type PostingPreviewPolicy = {
  ledgerAccounts: LedgerAccountState[];
};
