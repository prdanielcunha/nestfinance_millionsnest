import { readFile } from 'node:fs/promises';
import {
  detectDocumentTextSignals,
  DOCUMENT_TEXT_MAX_CANDIDATES,
  DOCUMENT_TEXT_MAX_CHARACTERS,
} from '../shared/finance/documentIntelligenceTextSignals.js';

let passed = 0;
function verify(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
}

const empty = detectDocumentTextSignals('   \n  ');
verify(empty.deterministic === true && empty.candidates.length === 0, 'empty input returns a deterministic empty result');
verify(empty.limited === false && empty.scannedCharacters === empty.inputCharacters, 'empty input is not reported as limited');

const taxIds = detectDocumentTextSignals('Emitente CNPJ 04.252.011/0001-10; responsável CPF 529.982.247-25.');
const cnpj = taxIds.candidates.find((candidate) => candidate.kind === 'cnpj');
const cpf = taxIds.candidates.find((candidate) => candidate.kind === 'cpf');
verify(cnpj?.normalized === '04252011000110' && cnpj.evidence === 'validated', 'valid formatted CNPJ is normalized and validated');
verify(cpf?.normalized === '52998224725' && cpf.evidence === 'validated', 'valid formatted CPF is normalized and validated');
verify(cnpj?.raw === '04.252.011/0001-10' && cpf?.raw === '529.982.247-25', 'tax ID raw evidence is preserved');

const compactTaxIds = detectDocumentTextSignals('CNPJ 04252011000110 CPF 52998224725');
verify(compactTaxIds.candidates.some((candidate) => candidate.kind === 'cnpj' && candidate.normalized === '04252011000110'), 'valid compact CNPJ is detected');
verify(compactTaxIds.candidates.some((candidate) => candidate.kind === 'cpf' && candidate.normalized === '52998224725'), 'valid compact CPF is detected');

const invalidTaxIds = detectDocumentTextSignals('CNPJ 11.111.111/1111-11 CPF 111.111.111-11');
verify(!invalidTaxIds.candidates.some((candidate) => candidate.kind === 'cnpj'), 'invalid CNPJ is rejected');
verify(!invalidTaxIds.candidates.some((candidate) => candidate.kind === 'cpf'), 'invalid CPF is rejected');

const dates = detectDocumentTextSignals('Emissão 29/02/2024. Vencimento 2026-08-24. Ruído 31/02/2024 e 2026-13-01.');
verify(dates.candidates.some((candidate) => candidate.kind === 'date' && candidate.normalized === '2024-02-29'), 'valid Brazilian date is normalized to ISO');
verify(dates.candidates.some((candidate) => candidate.kind === 'date' && candidate.normalized === '2026-08-24'), 'valid ISO date is preserved');
verify(!dates.candidates.some((candidate) => candidate.kind === 'date' && candidate.raw === '31/02/2024'), 'impossible calendar date is rejected');
verify(!dates.candidates.some((candidate) => candidate.kind === 'date' && candidate.raw === '2026-13-01'), 'invalid ISO month is rejected');

const money = detectDocumentTextSignals('Total R$ 1.234,56; taxa R$ 50; internacional BRL 1234.56; referência 9876,54 sem moeda.');
verify(money.candidates.some((candidate) => candidate.kind === 'money' && candidate.amountCents === 123456), 'explicit R$ amount with Brazilian separators is normalized to cents');
verify(money.candidates.some((candidate) => candidate.kind === 'money' && candidate.amountCents === 5000), 'explicit whole R$ amount is normalized to cents');
verify(money.candidates.some((candidate) => candidate.kind === 'money' && candidate.amountCents === 123456), 'explicit BRL decimal amount is recognized');
verify(!money.candidates.some((candidate) => candidate.kind === 'money' && candidate.raw.includes('9876,54')), 'bare ambiguous number is not classified as money');

const pix = detectDocumentTextSignals('Chave Pix: financeiro@example.org\nContato alternativo outro@example.org');
const pixKey = pix.candidates.find((candidate) => candidate.kind === 'pix_key');
verify(pixKey?.normalized === 'financeiro@example.org' && pixKey.evidence === 'explicit_label', 'Pix key requires and preserves explicit Pix labeling');
verify(!pix.candidates.some((candidate) => candidate.kind === 'pix_key' && candidate.normalized === 'outro@example.org'), 'unlabeled email is not inferred to be a Pix key');

const boleto44 = '00193373700000001000500940144816060680935031';
const boleto47 = '00190.00009 01234.567890 12345.678901 2 12340000010000';
const boletos = detectDocumentTextSignals(`Código ${boleto44}\nLinha ${boleto47}`);
verify(boletos.candidates.some((candidate) => candidate.kind === 'boleto' && candidate.normalized === boleto44 && candidate.boletoDigits === 44), '44-digit boleto/barcode candidate is detected as pattern-only');
verify(boletos.candidates.some((candidate) => candidate.kind === 'boleto' && candidate.normalized.length === 47 && candidate.boletoDigits === 47), 'formatted 47-digit boleto candidate is normalized');
verify(boletos.candidates.filter((candidate) => candidate.kind === 'boleto').every((candidate) => candidate.evidence === 'pattern_only'), 'boleto length detection never overclaims checksum validation');

const shortNumber = detectDocumentTextSignals('Referência 12345678901234567890');
verify(!shortNumber.candidates.some((candidate) => candidate.kind === 'boleto'), 'short numeric reference is not classified as boleto');

const offsetsText = 'ABC Total R$ 12,34 XYZ';
const offsets = detectDocumentTextSignals(offsetsText);
const amount = offsets.candidates.find((candidate) => candidate.kind === 'money');
verify(amount !== undefined && offsetsText.slice(amount.start, amount.end) === amount.raw, 'candidate offsets reproduce the exact raw evidence');
verify(amount?.context.includes('Total R$ 12,34'), 'candidate includes bounded local context');

const repeated = 'Data 24/08/2026; data 24/08/2026;';
const repeatedResult = detectDocumentTextSignals(repeated);
verify(repeatedResult.candidates.filter((candidate) => candidate.kind === 'date').length === 2, 'same normalized value at distinct offsets remains distinct evidence');

const manyDates = Array.from({ length: DOCUMENT_TEXT_MAX_CANDIDATES + 20 }, () => '24/08/2026').join(' ');
const capped = detectDocumentTextSignals(manyDates);
verify(capped.candidates.length === DOCUMENT_TEXT_MAX_CANDIDATES, 'candidate output is capped at the hard total limit');
verify(capped.candidateLimitReached === true && capped.limited === true, 'candidate cap is reported explicitly');
verify(capped.candidates.every((candidate, index, all) => index === 0 || candidate.start >= all[index - 1].start), 'capped candidates keep stable source order');

const beyondLimit = `${'A'.repeat(DOCUMENT_TEXT_MAX_CHARACTERS)} R$ 99,99`;
const clipped = detectDocumentTextSignals(beyondLimit);
verify(clipped.inputCharacters > DOCUMENT_TEXT_MAX_CHARACTERS && clipped.scannedCharacters === DOCUMENT_TEXT_MAX_CHARACTERS, 'input scanning is capped at the native-text 100k-character budget');
verify(clipped.limited === true && !clipped.candidates.some((candidate) => candidate.kind === 'money'), 'signals beyond the input cap are not scanned and limitation is explicit');

const deterministicInput = 'CNPJ 04.252.011/0001-10 | 24/08/2026 | R$ 10,50 | Pix: chave-exemplo';
verify(JSON.stringify(detectDocumentTextSignals(deterministicInput)) === JSON.stringify(detectDocumentTextSignals(deterministicInput)), 'repeated execution is byte-stable and deterministic');

const source = await readFile('shared/finance/documentIntelligenceTextSignals.ts', 'utf8');
verify(!source.includes('@google/genai') && !source.includes('generateContent') && !source.includes('Gemini'), 'parser introduces no AI dependency or model execution');
verify(!source.includes('firebase-admin') && !source.includes('firestore') && !source.includes('localStorage') && !source.includes('sessionStorage'), 'parser has no persistence path');
verify(!/fetch\(|axios|https?:\/\//.test(source), 'parser performs no network lookup');
verify(source.includes("from './taxId.js'"), 'parser reuses the existing canonical CNPJ validator');

const uiSource = await readFile('src/pages/finance/inbox/UniversalEvidencePdfReadinessCard.tsx', 'utf8');
const serviceSource = await readFile('src/services/universalEvidenceInboxService.ts', 'utf8');
const gatewaySource = await readFile('server/vercel-handlers/finance/universalEvidencePdfText.ts', 'utf8');
verify(!uiSource.includes('detectDocumentTextSignals'), 'I2I foundation is not wired into UI');
verify(!serviceSource.includes('detectDocumentTextSignals'), 'I2I foundation adds no client API call');
verify(!gatewaySource.includes('detectDocumentTextSignals'), 'I2I foundation does not alter the certified I2G endpoint');

console.log(`\nUniversal Evidence Deterministic Text Signals I2I totals: ${passed} Passed`);
