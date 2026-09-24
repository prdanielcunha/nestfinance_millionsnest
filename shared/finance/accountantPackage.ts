export const ACCOUNTANT_TRANSACTION_COLUMNS = [
  'transactionId',
  'occurredAt',
  'competenceDate',
  'transactionKind',
  'status',
  'amount',
  'currency',
  'counterparty',
  'description',
  'account',
  'paymentMethod',
  'reconciliationStatus',
  'categories',
  'funds',
  'costCenters',
  'evidenceIds',
  'justification',
] as const;

export const ACCOUNTANT_EVIDENCE_COLUMNS = [
  'evidenceId',
  'createdAt',
  'filename',
  'documentType',
  'processingState',
  'reviewStatus',
  'duplicate',
  'linkedTransactionIds',
] as const;

export const ACCOUNTANT_PENDING_COLUMNS = [
  'transactionId',
  'occurredAt',
  'status',
  'amount',
  'counterparty',
  'justification',
  'reconciliationStatus',
  'evidenceCount',
] as const;

export type AccountantTransactionColumn = typeof ACCOUNTANT_TRANSACTION_COLUMNS[number];
export type AccountantEvidenceColumn = typeof ACCOUNTANT_EVIDENCE_COLUMNS[number];
export type AccountantPendingColumn = typeof ACCOUNTANT_PENDING_COLUMNS[number];

export type AccountantPackageLayout = {
  transactionColumns: AccountantTransactionColumn[];
  evidenceColumns: AccountantEvidenceColumn[];
  pendingColumns: AccountantPendingColumn[];
};

export const DEFAULT_ACCOUNTANT_PACKAGE_LAYOUT: AccountantPackageLayout = {
  transactionColumns: [...ACCOUNTANT_TRANSACTION_COLUMNS],
  evidenceColumns: [...ACCOUNTANT_EVIDENCE_COLUMNS],
  pendingColumns: [...ACCOUNTANT_PENDING_COLUMNS],
};

function selectColumns<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(value) || value.length === 0) return [...fallback];
  const unique = Array.from(new Set(value.filter((item): item is T =>
    typeof item === 'string' && allowed.includes(item as T),
  )));
  return unique.length ? unique : [...fallback];
}

export function normalizeAccountantPackageLayout(value: unknown): AccountantPackageLayout {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    transactionColumns: selectColumns(
      record.transactionColumns,
      ACCOUNTANT_TRANSACTION_COLUMNS,
      DEFAULT_ACCOUNTANT_PACKAGE_LAYOUT.transactionColumns,
    ),
    evidenceColumns: selectColumns(
      record.evidenceColumns,
      ACCOUNTANT_EVIDENCE_COLUMNS,
      DEFAULT_ACCOUNTANT_PACKAGE_LAYOUT.evidenceColumns,
    ),
    pendingColumns: selectColumns(
      record.pendingColumns,
      ACCOUNTANT_PENDING_COLUMNS,
      DEFAULT_ACCOUNTANT_PACKAGE_LAYOUT.pendingColumns,
    ),
  };
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value) ? value.join(' | ') : String(value);
  const normalized = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, ' ');
  const formulaSafe = /^[=+\-@]/u.test(normalized.trimStart()) ? "'" + normalized : normalized;
  return '"' + formulaSafe.replace(/"/g, '""') + '"';
}

export function buildCsv(
  rows: Array<Record<string, unknown>>,
  columns: readonly string[],
) {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','));
  return [header, ...body].join('\r\n') + '\r\n';
}

export type AccountantPackageFile = {
  filename: string;
  mimeType: 'text/csv;charset=utf-8' | 'text/plain;charset=utf-8' | 'application/json;charset=utf-8';
  content: string;
};

export function buildAccountantManifest(input: {
  organizationId: string;
  financeEntityId: string;
  period: string;
  generatedAt: string;
  transactionCount: number;
  evidenceCount: number;
  pendingCount: number;
  closeReviewState: string;
}) {
  return {
    schemaVersion: 1,
    packageType: 'nestfinance_monthly_accountant_package',
    organizationId: input.organizationId,
    financeEntityId: input.financeEntityId,
    period: input.period,
    generatedAt: input.generatedAt,
    counts: {
      transactions: input.transactionCount,
      evidence: input.evidenceCount,
      pending: input.pendingCount,
    },
    closeReviewState: input.closeReviewState,
    authority: {
      operationalExport: true,
      officialAccountingStatement: false,
      certifiesPosting: false,
      certifiesTaxCompliance: false,
      postingCertificationSeparate: true,
      humanReviewRequired: true,
    },
  };
}
