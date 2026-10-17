import { JournalEntryId, JournalLineId, LedgerAccountId, TransactionId } from './ids.js';
import { assertAmountCents, sumAmountCents } from './money.js';
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
  if (!line || typeof line !== 'object' ||
      typeof line.ledgerAccountId !== 'string' || line.ledgerAccountId.trim().length === 0 ||
      typeof line.id !== 'string' || line.id.trim().length === 0 ||
      typeof line.organizationId !== 'string' || line.organizationId.trim().length === 0 ||
      typeof line.journalEntryId !== 'string' || line.journalEntryId.trim().length === 0 ||
      !Number.isSafeInteger(line.sequence) || line.sequence < 1) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Missing journal line identity or invalid sequence');
  }
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
  if (!Array.isArray(lines)) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Journal lines must be a list');
  }
  // Every value remains a non-negative integer and totals cannot overflow the
  // JS safe-integer boundary (which would silently corrupt posted balances).
  const debits = sumAmountCents(lines.map(line => line.debitCents));
  const credits = sumAmountCents(lines.map(line => line.creditCents));
  return { debits, credits };
}

export function validateJournalBalance(lines: JournalLine[], entityId: string): void {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 500) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Journal must have 2–500 lines');
  }
  if (typeof entityId !== 'string' || !entityId.trim()) {
    throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE');
  }
  const seqs = new Set<number>();
  const ids = new Set<string>();
  for (const line of lines) {
    validateJournalLine(line, entityId);
    if (seqs.has(line.sequence) || ids.has(line.id)) {
      throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Duplicate sequence or line identity');
    }
    seqs.add(line.sequence);
    ids.add(line.id);
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
  if (!entry || typeof entry !== 'object' ||
      typeof entry.id !== 'string' || !entry.id.trim() ||
      typeof entry.organizationId !== 'string' || !entry.organizationId.trim() ||
      typeof entry.financeEntityId !== 'string' || !entry.financeEntityId.trim() ||
      !Array.isArray(entry.lines)) {
    throw new LedgerDomainError('FINANCE_INVALID_JOURNAL_LINE', 'Missing journal header identity');
  }
  for (const line of entry.lines) {
    if (line.organizationId !== entry.organizationId ||
        line.journalEntryId !== entry.id) {
      throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE', 'Journal line belongs to another organization or entry');
    }
  }
  validateJournalBalance(entry.lines, entry.financeEntityId);
}
