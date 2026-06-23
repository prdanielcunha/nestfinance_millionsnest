type TransactionListQueryKeys = {
  version: 1;
  all: string;
  direction: string;
  status: string;
  directionStatus: string;
};

const MAX_TIMESTAMP_MS = 9999999999999;

export function buildTransactionListQueryKeys(
  financeEntityId: string,
  transactionId: string,
  transactionKind: string,
  status: string,
  occurredAtMs: number | string
): TransactionListQueryKeys {
  if (!financeEntityId || !transactionId || !transactionKind || !status || !occurredAtMs) {
    throw new Error('Invalid arguments to buildTransactionListQueryKeys');
  }

  // Validate delimiter-free
  if (
    financeEntityId.includes('|') ||
    transactionId.includes('|') ||
    transactionKind.includes('|') ||
    status.includes('|')
  ) {
    throw new Error('Arguments must not contain the delimiter |');
  }

  let tsMs: number;
  if (typeof occurredAtMs === 'string') {
     tsMs = new Date(occurredAtMs).getTime();
  } else {
     tsMs = occurredAtMs;
  }

  if (isNaN(tsMs) || tsMs < 0 || tsMs > MAX_TIMESTAMP_MS || !Number.isSafeInteger(tsMs)) {
    throw new Error('Invalid occurredAtMs');
  }

  const reverseTimestamp = String(MAX_TIMESTAMP_MS - tsMs).padStart(13, '0');

  // Format: entity|...|reverseTimestamp|transactionId
  return {
    version: 1,
    all: `${financeEntityId}|${reverseTimestamp}|${transactionId}`,
    direction: `${financeEntityId}|${transactionKind}|${reverseTimestamp}|${transactionId}`,
    status: `${financeEntityId}|${status}|${reverseTimestamp}|${transactionId}`,
    directionStatus: `${financeEntityId}|${transactionKind}|${status}|${reverseTimestamp}|${transactionId}`
  };
}

export function getTransactionListQueryBounds(
  financeEntityId: string,
  transactionKind?: string,
  status?: string,
  occurredFrom?: string,
  occurredTo?: string
): { field: string; startAt: string; endBefore: string } {
  if (!financeEntityId) {
    throw new Error('financeEntityId is required');
  }

  let field: string;
  let prefix: string;

  if (transactionKind && status) {
    field = 'listQueryKeys.directionStatus';
    prefix = `${financeEntityId}|${transactionKind}|${status}|`;
  } else if (transactionKind) {
    field = 'listQueryKeys.direction';
    prefix = `${financeEntityId}|${transactionKind}|`;
  } else if (status) {
    field = 'listQueryKeys.status';
    prefix = `${financeEntityId}|${status}|`;
  } else {
    field = 'listQueryKeys.all';
    prefix = `${financeEntityId}|`;
  }

  // Calculate reverse timestamps for bounds
  // occurredTo determines the start of our descending chronological query (smallest reverse ts)
  let startSuffix = '';
  if (occurredTo) {
    const toMs = new Date(occurredTo).getTime();
    if (!isNaN(toMs)) {
      startSuffix = String(MAX_TIMESTAMP_MS - toMs).padStart(13, '0');
    }
  }

  // occurredFrom determines the end of our descending chronological query (largest reverse ts)
  let endSuffix = '\uffff'; // default to highest possible string character
  if (occurredFrom) {
    const fromMs = new Date(occurredFrom).getTime();
    if (!isNaN(fromMs)) {
      // Include the exact fromMs by padding to ensure it matches prefix + reverseTimestamp correctly.
      // To include the exact millisecond, we need to end *after* it. Since reverseTimestamp is deterministic length (13),
      // we can append '\uffff' to make it end AFTER all transactions occurring exactly at fromMs.
      const reverseFrom = String(MAX_TIMESTAMP_MS - fromMs).padStart(13, '0');
      endSuffix = reverseFrom + '\uffff';
    }
  }

  return {
    field,
    startAt: prefix + startSuffix,
    endBefore: prefix + endSuffix
  };
}
