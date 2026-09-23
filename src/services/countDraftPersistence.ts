import type {
  CountDenominationQuantities,
  CountEntryMethod,
  CountEntryType,
} from '../../shared/finance/count.js';

export type CountDraftStep = 'choose' | 'count' | 'review';

export type CountLocalDraft = {
  sessionId: string;
  activeType: CountEntryType;
  method: CountEntryMethod;
  totalRaw: string;
  quantities: CountDenominationQuantities;
  step: CountDraftStep;
  updatedAt: number;
};

const PREFIX = 'nestfinance_count_draft_v1';

function storageKey(organizationId: string, financeEntityId: string, sessionId: string) {
  return `${PREFIX}:${organizationId}:${financeEntityId}:${sessionId}`;
}

function isEntryType(value: unknown): value is CountEntryType {
  return value === 'tithe' || value === 'offering' || value === 'other' || value === 'pix';
}

function isMethod(value: unknown): value is CountEntryMethod {
  return value === 'denominations' || value === 'total';
}

function isStep(value: unknown): value is CountDraftStep {
  return value === 'choose' || value === 'count' || value === 'review';
}

export const countDraftPersistence = {
  load(
    organizationId: string,
    financeEntityId: string,
    sessionId: string,
  ): CountLocalDraft | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageKey(organizationId, financeEntityId, sessionId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CountLocalDraft>;
      if (
        parsed.sessionId !== sessionId ||
        !isEntryType(parsed.activeType) ||
        !isMethod(parsed.method) ||
        !isStep(parsed.step) ||
        typeof parsed.totalRaw !== 'string' ||
        !parsed.quantities ||
        typeof parsed.quantities !== 'object' ||
        !Number.isFinite(parsed.updatedAt)
      ) {
        return null;
      }

      return {
        sessionId,
        activeType: parsed.activeType,
        method: parsed.method,
        totalRaw: parsed.totalRaw,
        quantities: parsed.quantities as CountDenominationQuantities,
        step: parsed.step,
        updatedAt: Number(parsed.updatedAt),
      };
    } catch {
      return null;
    }
  },

  save(
    organizationId: string,
    financeEntityId: string,
    sessionId: string,
    draft: Omit<CountLocalDraft, 'sessionId' | 'updatedAt'>,
  ) {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload: CountLocalDraft = {
        sessionId,
        ...draft,
        updatedAt: Date.now(),
      };
      localStorage.setItem(
        storageKey(organizationId, financeEntityId, sessionId),
        JSON.stringify(payload),
      );
    } catch {
      // Local persistence is best effort. Canonical cloud state remains authoritative.
    }
  },

  clear(organizationId: string, financeEntityId: string, sessionId: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(storageKey(organizationId, financeEntityId, sessionId));
    } catch {
      // Ignore unavailable storage.
    }
  },
};
