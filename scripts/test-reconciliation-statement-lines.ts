import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  prepareStatementLines,
  STATEMENT_PREPARATION_MAX_CANDIDATE_LINES,
  STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS,
} from '../shared/finance/reconciliationStatementLines.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const clear = prepareStatementLines([
  '02/09/2026 PIX RECEBIDO 1.250,00 C',
  '03/09/2026 TARIFA -12,50',
].join('\n'));

verify(clear.candidateLines === 2, 'clear statement rows become two deterministic candidates');
verify(
  clear.lines[0]?.parseState === 'prepared' &&
    clear.lines[0]?.selectedDate === '2026-09-02' &&
    clear.lines[0]?.selectedAmountCents === 125000 &&
    clear.lines[0]?.selectedDirection === 'inflow' &&
    clear.lines[0]?.descriptionCandidate === 'PIX RECEBIDO',
  'credit row preserves validated date, description, amount and explicit inflow direction',
);
verify(
  clear.lines[1]?.parseState === 'prepared' &&
    clear.lines[1]?.selectedAmountCents === 1250 &&
    clear.lines[1]?.selectedDirection === 'outflow',
  'minus sign produces an explicit outflow candidate without semantic guessing',
);

const unknown = prepareStatementLines('04/09/2026 TED FORNECEDOR 900,00');
verify(
  unknown.lines[0]?.parseState === 'needs_direction_confirmation' &&
    unknown.lines[0]?.selectedAmountCents === 90000 &&
    unknown.lines[0]?.selectedDirection === 'unknown',
  'amount without an explicit debit/credit marker never guesses direction',
);

const twoAmounts = prepareStatementLines('05/09/2026 PIX CLIENTE 100,00 1.500,00');
verify(
  twoAmounts.lines[0]?.parseState === 'needs_amount_choice' &&
    twoAmounts.lines[0]?.amountCandidates.length === 2 &&
    twoAmounts.lines[0]?.selectedAmountCents === null,
  'line with transaction amount plus balance stays ambiguous instead of auto-selecting one',
);

const twoDates = prepareStatementLines('05/09/2026 AGENDADO 06/09/2026 100,00 C');
verify(
  twoDates.lines[0]?.parseState === 'needs_date_choice' &&
    twoDates.lines[0]?.dateCandidates.length === 2 &&
    twoDates.lines[0]?.selectedDate === null,
  'line with multiple valid dates requires date choice',
);

const currency = prepareStatementLines('06/09/2026 AJUSTE BRL 1,234.56 CR');
verify(
  currency.lines[0]?.selectedAmountCents === 123456 &&
    currency.lines[0]?.selectedDirection === 'inflow' &&
    currency.lines[0]?.amountCandidates[0]?.currency === 'BRL',
  'explicit BRL amount supports international decimal formatting deterministically',
);

const markerBoundary = prepareStatementLines('07/09/2026 TESTE 100,00 CONTA');
verify(
  markerBoundary.lines[0]?.selectedDirection === 'unknown',
  'C at the start of a following word is not mistaken for a credit marker',
);

const invalid = prepareStatementLines([
  '31/02/2026 IMPOSSIVEL 100,00 C',
  '08/09/2026 SEM VALOR INTEIRO 100 C',
  '09/09/2026 SOMENTE DATA',
  'CABECALHO R$ 200,00',
].join('\n'));
verify(invalid.candidateLines === 0, 'invalid dates, integers, date-only rows and amount-only headers are ignored');

const metadata = prepareStatementLines('10/09/2026 PIX 10,00 D').lines[0];
verify(
  metadata?.semanticState === 'unconfirmed' &&
    metadata?.requiresConfirmation === true &&
    metadata?.source === 'native_text' &&
    metadata?.derivedBy === 'deterministic_rule' &&
    metadata?.aiUsed === false &&
    metadata?.ocrUsed === false &&
    metadata?.userConfirmed === false,
  'every prepared line remains explicitly unconfirmed native-text evidence',
);

const many = Array.from(
  { length: STATEMENT_PREPARATION_MAX_CANDIDATE_LINES + 5 },
  (_, index) => '11/09/2026 ITEM ' + String(index) + ' 1,00 C',
).join('\n');
const capped = prepareStatementLines(many);
verify(
  capped.lines.length === STATEMENT_PREPARATION_MAX_CANDIDATE_LINES &&
    capped.candidateLimitReached === true &&
    capped.limited === true,
  'candidate fan-out is capped and the limitation is explicit',
);

const oversized = 'A'.repeat(STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS + 20) + '\n12/09/2026 LATE 1,00 C';
const inputCapped = prepareStatementLines(oversized);
verify(
  inputCapped.inputLimited === true &&
    inputCapped.scannedCharacters === STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS &&
    inputCapped.candidateLines === 0,
  'input beyond the 100k certified text boundary is never scanned',
);

const deterministicInput = '13/09/2026 PIX TESTE 55,90 D\n14/09/2026 TED 42,00 C';
verify(
  JSON.stringify(prepareStatementLines(deterministicInput)) ===
    JSON.stringify(prepareStatementLines(deterministicInput)),
  'same native text produces byte-stable preparation output',
);

const source = await readFile('shared/finance/reconciliationStatementLines.ts', 'utf8');
for (const forbidden of [
  '@google/genai',
  'generateContent',
  'OpenAI',
  'firebase-admin',
  'firestore',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch(',
  'axios',
]) {
  verify(!source.includes(forbidden), 'statement parser has no dependency on ' + forbidden);
}
verify(
  !source.includes('financeTransactions') &&
    !source.includes('financeJournalEntries') &&
    !source.includes('financeBalances') &&
    !source.includes('reconciliationStatus'),
  'statement parser contains no accounting or reconciliation mutation path',
);

console.log('\nStatement Line Preparation totals: ' + passed + ' Passed');
