import type {
  NestFinanceSignalActionCode,
  NestFinanceSignalAttentionLevel,
  NestFinanceSignalType,
} from './canonicalSignal.js';
import type { CanonicalFactSourceRef } from './canonicalFact.js';

export type NeedsAttentionCoverage =
  | {
      mode: 'partial_projection';
      canDeclareAllClear: false;
      canTrustSignalAbsence: false;
      reason: 'PRE_P5_BACKFILL_NOT_CERTIFIED';
      signalSchemaVersion: 1;
    }
  | {
      mode: 'certified_projection';
      canDeclareAllClear: false;
      canTrustSignalAbsence: true;
      reason: 'BACKFILL_CERTIFIED_SIGNAL_SCOPE';
      signalSchemaVersion: 1;
      factSchemaVersion: 1;
      backfillVersion: 1;
      coverageId: string;
      certifiedAt: string | null;
      coveredSignalTypes: NestFinanceSignalType[];
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
  currentStateVerified: true;
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
