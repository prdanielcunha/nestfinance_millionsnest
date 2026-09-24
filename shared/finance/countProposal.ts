import type { CountEntryType, NormalizedCountEntry } from './count.js';

export const COUNT_WORKFLOW_STATES = [
  'counted',
  'reviewed',
  'deposited',
  'reconciled',
  'closed',
] as const;

export type CountWorkflowState = (typeof COUNT_WORKFLOW_STATES)[number];

export type CountProposalLine = {
  lineId: string;
  entryType: CountEntryType;
  amountCents: number;
  paymentMethod: 'cash' | 'pix';
};

export function isCountWorkflowState(value: unknown): value is CountWorkflowState {
  return typeof value === 'string' && COUNT_WORKFLOW_STATES.includes(value as CountWorkflowState);
}

export function buildCountProposalLines(entries: NormalizedCountEntry[]): CountProposalLine[] {
  return entries
    .filter((entry) => Number.isSafeInteger(entry.totalCents) && entry.totalCents > 0)
    .map((entry) => ({
      lineId: `count_${entry.type}`,
      entryType: entry.type,
      amountCents: entry.totalCents,
      paymentMethod: entry.type === 'pix' ? 'pix' : 'cash',
    }));
}

export function defaultCountWorkflowState(status: string): CountWorkflowState | null {
  return status === 'matched' ? 'counted' : null;
}
