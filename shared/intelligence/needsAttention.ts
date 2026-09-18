import type {
  NestFinanceSignalActionCode,
  NestFinanceSignalAttentionLevel,
  NestFinanceSignalType,
} from './canonicalSignal.js';
import type { CanonicalFactSourceRef } from './canonicalFact.js';

export type NeedsAttentionCoverage = {
  mode: 'partial_projection';
  canDeclareAllClear: false;
  reason: 'PRE_P5_BACKFILL_NOT_CERTIFIED';
  signalSchemaVersion: 1;
};

export type NeedsAttentionSignalSummaryItem = {
  signalId: string;
  signalType: NestFinanceSignalType;
  entityType: string;
  entityId: string;
  attentionLevel: NestFinanceSignalAttentionLevel;
  requiredCapability: string;
  actionCode: NestFinanceSignalActionCode;
  openedAt: string | null;
  updatedAt: string | null;
  explainable: true;
};

export type NeedsAttentionSignalSummary = {
  coverage: NeedsAttentionCoverage;
  actionableOpenTotal: number;
  byType: Record<NestFinanceSignalType, number>;
  items: NeedsAttentionSignalSummaryItem[];
};

export type NeedsAttentionSignalDetail = {
  signal: NeedsAttentionSignalSummaryItem & {
    status: 'open' | 'resolved';
    resolvedAt: string | null;
  };
  explanation: {
    factId: string;
    eventType: string;
    occurredAt: string | null;
    recordedAt: string | null;
    structuredReason: Record<string, unknown>;
    sourceRefs: CanonicalFactSourceRef[];
  };
};
