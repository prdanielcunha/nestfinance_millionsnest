import { TransactionId, IdempotencyKey, RequestId } from './ids.js';

export type PostingCommand = {
  transactionId: TransactionId;
  expectedVersion: number;
  idempotencyKey: IdempotencyKey;
  requestId: RequestId;
};

export type PostingResult = {
  success: boolean;
  transactionId: TransactionId;
  journalEntryId?: string;
  newVersion: number;
  error?: string;
};

export type ReversalCommand = {
  transactionId: TransactionId;
  expectedVersion: number;
  idempotencyKey: IdempotencyKey;
  requestId: RequestId;
  reason: string;
};
