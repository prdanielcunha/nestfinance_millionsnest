import { JournalEntryId, JournalLineId, LedgerAccountId, TransactionId } from './ids.js';
import { assertAmountCents } from './money.js';
import { LedgerDomainError } from './errors.js';

export type JournalLine = {
  id: JournalLineId;
  organizationId: string;
  financeEntityId: string;
  journalEntryId: JournalEntryId;
  ledgerAccountId: LedgerAccountId;
  debitCents: number;
  creditCents: number;
  fundId?: string;
  categoryId?: string;
  costCenterId?: string;
  memo?: string;
  sequence: number;
};

export type JournalEntry = {
  id: JournalEntryId;
  organizationId: string;
  financeEntityId: string;
  sourceTransactionId: TransactionId;
  description: string;
  postedAt: string; // ISO
  postedBy: string;
  status: 'valid' | 'reversed';
  reversalOfEntryId?: JournalEntryId;
  lines: JournalLine[];
};

export type LedgerAccountDefinition = {
  id: LedgerAccountId;
  organizationId: string;
  financeEntityId: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  normalBalance: 'debit' | 'credit';
  postingAllowed: boolean;
  active: boolean;
};

export function validateJournalLine(line: JournalLine, entityId: string): void {
  assertAmountCents(line.debitCents);
  assertAmountCents(line.creditCents);
  
  if (line.debitCents > 0 && line.creditCents > 0) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Line cannot have both debit and credit');
  }

  if (line.debitCents === 0 && line.creditCents === 0) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Line must have either debit or credit');
  }

  if (line.financeEntityId !== entityId) {
    throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE');
  }
}

export function calculateJournalTotals(lines: JournalLine[]): { debits: number, credits: number } {
  let debits = 0;
  let credits = 0;
  
  for (const line of lines) {
    debits += line.debitCents;
    credits += line.creditCents;
  }
  
  return { debits, credits };
}

export function validateJournalBalance(lines: JournalLine[], entityId: string): void {
  const seqs = new Set<number>();
  for (const line of lines) {
    if (seqs.has(line.sequence)) throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Duplicate sequence');
    seqs.add(line.sequence);
    validateJournalLine(line, entityId);
  }

  const { debits, credits } = calculateJournalTotals(lines);
  
  if (debits === 0 && credits === 0) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Journal total cannot be zero');
  }
  
  if (debits !== credits) {
    throw new LedgerDomainError('FINANCE_JOURNAL_UNBALANCED');
  }
}

export function assertJournalBalanced(entry: JournalEntry): void {
  validateJournalBalance(entry.lines, entry.financeEntityId);
}
