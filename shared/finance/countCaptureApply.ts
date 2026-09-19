import {
  COUNT_CASH_ENTRY_TYPES,
  COUNT_DENOMINATIONS_CENTS,
  normalizeCountEntries,
  type CountDenominationQuantities,
  type CountEntryDraft,
  type NormalizedCountEntry,
} from './count.js';
import {
  COUNT_CAPTURE_FIELD_KEYS,
  type CountCaptureReviewedField,
} from './countCapture.js';
import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  type CountCaptureReviewedDenomination,
} from './countCaptureDenominations.js';

export type CountCaptureAppliedEntrySource = 'reviewed_total' | 'reviewed_denominations';

export type CountCaptureApplyPlan = {
  entries: NormalizedCountEntry[];
  sources: Record<'tithe' | 'offering' | 'other' | 'pix', CountCaptureAppliedEntrySource>;
};

function requireReviewedTotals(raw: unknown): CountCaptureReviewedField[] {
  if (!Array.isArray(raw) || raw.length !== COUNT_CAPTURE_FIELD_KEYS.length) {
    throw new Error('COUNT_CAPTURE_REVIEW_REQUIRED');
  }
  const fields = raw as CountCaptureReviewedField[];
  for (const key of COUNT_CAPTURE_FIELD_KEYS) {
    const field = fields.find((item) => item?.key === key);
    if (!field || field.decision === 'unreadable' || field.valueCents === null || !Number.isSafeInteger(field.valueCents) || field.valueCents < 0) {
      throw new Error('COUNT_CAPTURE_REVIEW_INCOMPLETE');
    }
  }
  return fields;
}

function reviewedDenominationDraft(
  raw: unknown,
  entryType: 'tithe' | 'offering' | 'other',
): CountEntryDraft | null {
  if (!Array.isArray(raw) || raw.length !== COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length) return null;
  const rows = raw as CountCaptureReviewedDenomination[];
  const selected = rows.filter((row) => row?.entryType === entryType);
  if (selected.length !== COUNT_DENOMINATIONS_CENTS.length || selected.some((row) => row.decision === 'unreadable')) return null;

  const denominations: CountDenominationQuantities = {};
  for (const denominationCents of COUNT_DENOMINATIONS_CENTS) {
    const row = selected.find((item) => item.denominationCents === denominationCents);
    if (!row) return null;
    if (row.decision === 'blank') continue;
    if (!Number.isInteger(row.quantity) || Number(row.quantity) < 0) return null;
    if (Number(row.quantity) > 0) denominations[String(denominationCents)] = Number(row.quantity);
  }
  return { type: entryType, method: 'denominations', denominations };
}

export function buildCountCaptureApplyPlan(input: {
  reviewedFields: unknown;
  reviewedDenominations?: unknown;
}): CountCaptureApplyPlan {
  const fields = requireReviewedTotals(input.reviewedFields);
  const fieldValue = (key: 'tithe' | 'offering' | 'other_income' | 'pix') =>
    fields.find((field) => field.key === key)!.valueCents as number;

  const drafts: CountEntryDraft[] = [];
  const sources: CountCaptureApplyPlan['sources'] = {
    tithe: 'reviewed_total',
    offering: 'reviewed_total',
    other: 'reviewed_total',
    pix: 'reviewed_total',
  };

  for (const entryType of COUNT_CASH_ENTRY_TYPES) {
    const fieldKey = entryType === 'other' ? 'other_income' : entryType;
    const reviewedTotal = fieldValue(fieldKey);
    const denominationDraft = reviewedDenominationDraft(input.reviewedDenominations, entryType);
    if (denominationDraft) {
      const normalized = normalizeCountEntries([denominationDraft])[0];
      if (normalized.totalCents !== reviewedTotal) {
        throw new Error('COUNT_CAPTURE_DENOMINATION_TOTAL_MISMATCH');
      }
      drafts.push(denominationDraft);
      sources[entryType] = 'reviewed_denominations';
    } else {
      drafts.push({ type: entryType, method: 'total', totalCents: reviewedTotal });
    }
  }

  drafts.push({ type: 'pix', method: 'total', totalCents: fieldValue('pix') });
  return { entries: normalizeCountEntries(drafts), sources };
}
