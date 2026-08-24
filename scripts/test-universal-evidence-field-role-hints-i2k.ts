import { readFile } from 'node:fs/promises';
import {
  detectDocumentTextSignals,
  type DocumentTextSignalsResult,
} from '../shared/finance/documentIntelligenceTextSignals.js';
import {
  buildDocumentFieldRoleHints,
  DOCUMENT_FIELD_ROLE_PREFIX_MAX_CHARACTERS,
  type DocumentFieldRoleHint,
} from '../shared/finance/documentIntelligenceFieldRoleHints.js';

let passed = 0;
function verify(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
}

function rolesFor(text: string) {
  return buildDocumentFieldRoleHints(text, detectDocumentTextSignals(text));
}

function hasRole(text: string, roleHint: DocumentFieldRoleHint) {
  return rolesFor(text).candidates.some((candidate) => candidate.roleHint === roleHint);
}

const pt = [
  'Emissão: 24/08/2026',
  'Vencimento: 30/08/2026',
  'Valor total: R$ 742,91',
  'CNPJ do emitente: 04.252.011/0001-10',
  'CNPJ destinatário: 04.252.011/0001-10',
  'Linha digitável: 00190.00009 01234.567890 12345.678901 2 12340000010000',
  'Chave Pix: financeiro@example.org',
].join('\n');
const ptRoles = rolesFor(pt);
verify(ptRoles.deterministic === true, 'role hints result is explicitly deterministic');
verify(ptRoles.hintedCandidates === 7, 'PT explicit labels produce exactly seven bounded role hints');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'issue_date'), 'PT emissão maps to issue_date');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'due_date'), 'PT vencimento maps to due_date');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'total_amount'), 'PT valor total maps to total_amount');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'issuer_tax_id'), 'PT emitente maps to issuer_tax_id');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'recipient_tax_id'), 'PT destinatário maps to recipient_tax_id');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'payment_code'), 'PT linha digitável maps to payment_code');
verify(ptRoles.candidates.some((candidate) => candidate.roleHint === 'pix_key'), 'explicit Pix signal maps to pix_key');

const en = [
  'Issue date: 2026-08-24',
  'Due date: 2026-08-30',
  'Total amount: BRL 100.50',
  'Issuer CNPJ: 04.252.011/0001-10',
  'Recipient CNPJ: 04.252.011/0001-10',
  'Barcode: 00193373700000001000500940144816060680935031',
].join('\n');
verify(hasRole(en, 'issue_date'), 'EN issue date label is supported deterministically');
verify(hasRole(en, 'due_date'), 'EN due date label is supported deterministically');
verify(hasRole(en, 'total_amount'), 'EN total amount label is supported deterministically');
verify(hasRole(en, 'issuer_tax_id'), 'EN issuer tax-id label is supported deterministically');
verify(hasRole(en, 'recipient_tax_id'), 'EN recipient tax-id label is supported deterministically');
verify(hasRole(en, 'payment_code'), 'EN barcode label is supported deterministically');

const es = [
  'Fecha de emisión: 24/08/2026',
  'Fecha de vencimiento: 30/08/2026',
  'Importe total: R$ 50,00',
  'Emisor CNPJ: 04.252.011/0001-10',
  'Receptor CNPJ: 04.252.011/0001-10',
  'Línea digitable: 00190.00009 01234.567890 12345.678901 2 12340000010000',
].join('\n');
verify(hasRole(es, 'issue_date'), 'ES fecha de emisión label is supported deterministically');
verify(hasRole(es, 'due_date'), 'ES fecha de vencimiento label is supported deterministically');
verify(hasRole(es, 'total_amount'), 'ES importe total label is supported deterministically');
verify(hasRole(es, 'issuer_tax_id'), 'ES emisor tax-id label is supported deterministically');
verify(hasRole(es, 'recipient_tax_id'), 'ES receptor tax-id label is supported deterministically');
verify(hasRole(es, 'payment_code'), 'ES línea digitable label is supported deterministically');

verify(!hasRole('Data: 24/08/2026', 'issue_date') && !hasRole('Data: 24/08/2026', 'due_date'), 'generic date label never guesses issue or due semantics');
verify(!hasRole('Valor: R$ 10,00', 'total_amount'), 'generic value label does not become total amount');
verify(!hasRole('Subtotal: R$ 10,00', 'total_amount'), 'subtotal does not false-match total');
verify(!hasRole('Total impostos: R$ 10,00', 'total_amount'), 'qualified tax total does not false-match document total');
verify(!hasRole('Vencimento:\n24/08/2026', 'due_date'), 'role labels do not cross line boundaries');
verify(!hasRole(`Vencimento${' '.repeat(DOCUMENT_FIELD_ROLE_PREFIX_MAX_CHARACTERS + 8)}24/08/2026`, 'due_date'), 'role labels outside the bounded prefix window are ignored');
verify(!hasRole('Vencimento: R$ 10,00', 'due_date'), 'date role cannot attach to a money signal');
verify(!hasRole('Valor total: 24/08/2026', 'total_amount'), 'money role cannot attach to a date signal');
verify(rolesFor('CNPJ: 04.252.011/0001-10').hintedCandidates === 0, 'bare CNPJ remains semantically unassigned');
verify(rolesFor('00193373700000001000500940144816060680935031').hintedCandidates === 0, 'unlabeled boleto pattern remains semantically unassigned');

const metadata = ptRoles.candidates;
verify(metadata.every((candidate) => candidate.semanticState === 'unconfirmed'), 'every candidate remains semantically unconfirmed');
verify(metadata.every((candidate) => candidate.requiresConfirmation === true), 'every role candidate requires human confirmation');
verify(metadata.every((candidate) => candidate.source === 'native_text'), 'origin is explicit native_text for every candidate');
verify(metadata.every((candidate) => candidate.derivedBy === 'deterministic_rule'), 'derivation source is explicit deterministic_rule');
verify(metadata.every((candidate) => candidate.ocrUsed === false && candidate.aiUsed === false), 'I2K explicitly reports zero OCR and zero AI');
verify(metadata.every((candidate) => candidate.userConfirmed === false), 'I2K never marks a candidate as user-confirmed');
verify(metadata.filter((candidate) => candidate.roleHint !== null).every((candidate) => candidate.roleEvidence === 'explicit_label' && Boolean(candidate.matchedLabel)), 'every assigned role preserves explicit-label evidence');
verify(metadata.filter((candidate) => candidate.roleHint === null).every((candidate) => candidate.roleEvidence === null && candidate.matchedLabel === null), 'unassigned candidates carry no invented role evidence');

const sourceSignals = detectDocumentTextSignals('Vencimento: 24/08/2026');
const sourceRoles = buildDocumentFieldRoleHints('Vencimento: 24/08/2026', sourceSignals);
verify(sourceRoles.candidates[0]?.signal === sourceSignals.candidates[0], 'I2K wraps the original I2I signal without rewriting its evidence');

const outside: DocumentTextSignalsResult = {
  deterministic: true,
  inputCharacters: 20,
  scannedCharacters: 5,
  limited: true,
  candidateLimitReached: false,
  candidates: [{
    kind: 'date', raw: '24/08/2026', normalized: '2026-08-24', start: 8, end: 18,
    context: '24/08/2026', evidence: 'validated',
  }],
};
const outsideRole = buildDocumentFieldRoleHints('Vencimento: 24/08/2026', outside).candidates[0];
verify(outsideRole?.roleHint === null, 'candidate outside the certified scanned boundary fails closed to unassigned');

const implementation = await readFile(new URL('../shared/finance/documentIntelligenceFieldRoleHints.ts', import.meta.url), 'utf8');
verify(!/@google\/genai|generateContent|GEMINI/i.test(implementation), 'I2K foundation introduces no AI dependency or model execution');
verify(!/firebase-admin|firestore|localStorage|sessionStorage|indexedDB/i.test(implementation), 'I2K foundation has no persistence path');
verify(!/\bfetch\s*\(|axios|https?:\/\//i.test(implementation), 'I2K foundation performs no network lookup');
verify(!/financeTransactions|financeJournalEntries|financeAggregates|PostingPlan|countSessions/i.test(implementation), 'I2K foundation contains no accounting or posting mutation path');

console.log(`\nUniversal Evidence Deterministic Field Role Hints I2K totals: ${passed} Passed`);
