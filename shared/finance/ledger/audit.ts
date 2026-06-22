import { IdempotencyKey, RequestId } from './ids.js';

export type FinanceAuditEvent = {
  eventId: string;
  organizationId: string;
  financeEntityId: string;
  actor: string;
  resource: 'transaction' | 'allocation' | 'journal';
  action: 
    | 'transaction.created'
    | 'transaction.updated'
    | 'transaction.submitted'
    | 'transaction.posted'
    | 'transaction.reversed'
    | 'allocation.created'
    | 'allocation.updated'
    | 'journal.posted'
    | 'journal.reversed';
  requestId: RequestId;
  idempotencyKey?: IdempotencyKey;
  beforeHash?: string;
  afterHash?: string;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt: string; // ISO server-side timestamp
};
