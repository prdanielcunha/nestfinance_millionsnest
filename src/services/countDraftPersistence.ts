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

const PREFIX = 'nestfinance_count_draft_v2';
const LEGACY_PREFIX = 'nestfinance_count_draft_v1';

function storageKey(organizationId: string, financeEntityId: string, sessionId: string, userId: string) {
  return `${PREFIX}:${organizationId}:${financeEntityId}:${sessionId}:${encodeURIComponent(userId)}`;
}

function removeUnsafeLegacyDraft(organizationId: string, financeEntityId: string, sessionId: string) {
  // V1 was shared by everyone using the same browser. Its ownership cannot be
  // verified, so NEVER migrate or display it to a signed-in user.
  localStorage.removeItem(`${LEGACY_PREFIX}:${organizationId}:${financeEntityId}:${sessionId}`);
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
    userId: string,
  ): CountLocalDraft | null {
    if (typeof localStorage === 'undefined' || !userId) return null;
    try {
      removeUnsafeLegacyDraft(organizationId, financeEntityId, sessionId);
      const raw = localStorage.getItem(storageKey(organizationId, financeEntityId, sessionId, userId));
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
    userId: string,
    draft: Omit<CountLocalDraft, 'sessionId' | 'updatedAt'>,
  ) {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
      removeUnsafeLegacyDraft(organizationId, financeEntityId, sessionId);
      const payload: CountLocalDraft = {
        sessionId,
        ...draft,
        updatedAt: Date.now(),
      };
      localStorage.setItem(
        storageKey(organizationId, financeEntityId, sessionId, userId),
        JSON.stringify(payload),
      );
    } catch {
      // Local persistence is best effort. Canonical cloud state remains authoritative.
    }
  },

  clear(organizationId: string, financeEntityId: string, sessionId: string, userId: string) {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
      removeUnsafeLegacyDraft(organizationId, financeEntityId, sessionId);
      localStorage.removeItem(storageKey(organizationId, financeEntityId, sessionId, userId));
    } catch {
      // Ignore unavailable storage.
    }
  },
};
