import { readFile } from 'node:fs/promises';
import { detectDocumentTextSignals } from '../shared/finance/documentIntelligenceTextSignals.js';
import { buildDocumentFieldRoleHints } from '../shared/finance/documentIntelligenceFieldRoleHints.js';

let passed = 0;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
};

const panel = await readFile('src/pages/finance/inbox/UniversalEvidenceTextSignalsPanel.tsx', 'utf8');
const copy = await readFile('src/pages/finance/inbox/pdfSignalsCopy.ts', 'utf8');
const service = await readFile('src/services/universalEvidenceInboxService.ts', 'utf8');
const gateway = await readFile('api/finance-gateway.ts', 'utf8');
const pdfTextHandler = await readFile('server/vercel-handlers/finance/universalEvidencePdfText.ts', 'utf8');

check(panel.includes('buildDocumentFieldRoleHints') && panel.includes('../../../../shared/finance/documentIntelligenceFieldRoleHints.js'), 'I2L reuses the certified I2K deterministic role-hint foundation');
check(panel.includes('const detectedSignals = detectDocumentTextSignals(text)') && panel.includes('buildDocumentFieldRoleHints(text, detectedSignals)'), 'I2L enriches the same I2I result without re-reading or re-parsing another source');
check((panel.match(/detectDocumentTextSignals\(text\)/g) || []).length === 1, 'I2L keeps one deterministic signal parse per explicit analysis action');
check((panel.match(/buildDocumentFieldRoleHints\(text, detectedSignals\)/g) || []).length === 1, 'I2L keeps one deterministic role-hint pass per explicit analysis action');
check(panel.includes('onClick={analyzeSignals}'), 'I2L remains behind the existing explicit Analyze signals action');
check(!panel.includes('useEffect('), 'I2L role analysis never runs from a lifecycle effect');
check(!panel.includes('fetch(') && !panel.includes('universalEvidenceInboxService'), 'I2L adds no network request');
check(!/localStorage|sessionStorage|indexedDB/i.test(panel), 'I2L persists neither signals nor role hints in browser storage');
check(!panel.includes('dangerouslySetInnerHTML') && !panel.includes('innerHTML'), 'role labels and supporting evidence render as inert React text');

check(panel.includes('roleCandidate?.roleHint'), 'I2L only renders a semantic role when I2K actually assigned one');
check(panel.includes('copy.roleUnassigned'), 'I2L visibly preserves an unassigned semantic state instead of guessing');
check(panel.includes('roleCandidate.matchedLabel'), 'I2L exposes the explicit label that supported an assigned role');
check(panel.includes('copy.roleHintBody'), 'I2L shows the human-confirmation boundary beside assigned roles');
check(!/onConfirm|confirmRole|saveRole|persistRole|applyRole/.test(panel), 'I2L introduces no confirm/save/apply mutation action');

check(copy.includes('Possível papel no documento') && copy.includes('Possible role in the document') && copy.includes('Posible función en el documento'), 'role-hint heading is localized in PT EN and ES');
check(copy.includes('Precisa de confirmação humana') && copy.includes('Human confirmation is required') && copy.includes('Requiere confirmación humana'), 'all languages state that role hints require human confirmation');
check(copy.includes('Não determinado automaticamente') && copy.includes('Not determined automatically') && copy.includes('No determinada automáticamente'), 'all languages expose semantic uncertainty instead of guessing');
check(copy.includes('Rótulo que sustentou a sugestão') && copy.includes('Label supporting the suggestion') && copy.includes('Etiqueta que respalda la sugerencia'), 'supporting-label evidence is localized in PT EN and ES');
check(copy.includes("issue_date: 'Data de emissão'") && copy.includes("issue_date: 'Issue date'") && copy.includes("issue_date: 'Fecha de emisión'"), 'issue-date role is localized');
check(copy.includes("due_date: 'Data de vencimento'") && copy.includes("due_date: 'Due date'") && copy.includes("due_date: 'Fecha de vencimiento'"), 'due-date role is localized');
check(copy.includes("total_amount: 'Valor total'") && copy.includes("total_amount: 'Total amount'") && copy.includes("total_amount: 'Importe total'"), 'total-amount role is localized');
check(copy.includes('Documento fiscal do emitente') && copy.includes('Issuer tax ID') && copy.includes('Identificación fiscal del emisor'), 'issuer-tax role is localized');
check(copy.includes('Documento fiscal do destinatário') && copy.includes('Recipient tax ID') && copy.includes('Identificación fiscal del receptor'), 'recipient-tax role is localized');
check(copy.includes('Código de pagamento') && copy.includes('Payment code') && copy.includes('Código de pago'), 'payment-code role is localized');
check(copy.includes("pix_key: 'Chave Pix'") && copy.includes("pix_key: 'Pix key'") && copy.includes("pix_key: 'Clave Pix'"), 'Pix role is localized');
check(copy.includes('não são salvos') && copy.includes('are not saved') && copy.includes('no se guardan'), 'role hints remain explicitly non-persistent in all languages');
check(copy.includes('não criam lançamentos') && copy.includes('do not create entries') && copy.includes('no crean asientos'), 'role hints explicitly create no financial entry in all languages');

const labeledText = [
  'Emissão: 24/08/2026',
  'Vencimento: 30/08/2026',
  'Valor total: R$ 742,91',
  'CNPJ do emitente: 04.252.011/0001-10',
  'Linha digitável: 00190.00009 01234.567890 12345.678901 2 12340000010000',
].join('\n');
const labeledSignals = detectDocumentTextSignals(labeledText);
const labeledRoles = buildDocumentFieldRoleHints(labeledText, labeledSignals);
check(labeledRoles.candidates.some((candidate) => candidate.roleHint === 'issue_date' && candidate.requiresConfirmation), 'integrated I2L sample surfaces issue date only as confirmation-required hint');
check(labeledRoles.candidates.some((candidate) => candidate.roleHint === 'due_date' && candidate.requiresConfirmation), 'integrated I2L sample surfaces due date only as confirmation-required hint');
check(labeledRoles.candidates.some((candidate) => candidate.roleHint === 'total_amount' && candidate.requiresConfirmation), 'integrated I2L sample surfaces total amount only as confirmation-required hint');
check(labeledRoles.candidates.some((candidate) => candidate.roleHint === 'issuer_tax_id' && candidate.requiresConfirmation), 'integrated I2L sample surfaces issuer tax ID only as confirmation-required hint');
check(labeledRoles.candidates.some((candidate) => candidate.roleHint === 'payment_code' && candidate.requiresConfirmation), 'integrated I2L sample surfaces payment code only as confirmation-required hint');

const ambiguousText = 'Data: 24/08/2026\nValor: R$ 10,00\nCNPJ: 04.252.011/0001-10';
const ambiguousRoles = buildDocumentFieldRoleHints(ambiguousText, detectDocumentTextSignals(ambiguousText));
check(ambiguousRoles.candidates.length > 0 && ambiguousRoles.candidates.every((candidate) => candidate.roleHint === null), 'integrated I2L sample leaves generic labels semantically unassigned');
check(labeledRoles.candidates.every((candidate) => candidate.semanticState === 'unconfirmed' && candidate.userConfirmed === false), 'I2L receives no pre-confirmed semantic field from I2K');

const combined = `${panel}\n${copy}`;
check(!combined.includes('@google/genai') && !combined.includes('generateContent(') && !combined.includes('Gemini'), 'I2L introduces no AI execution path');
check(!combined.includes('firebase-admin') && !combined.includes('firestore'), 'I2L introduces no direct persistence path');
check(!/createJournal|createPosting|postTransaction|PostingPlan|balanceMutation|financeJournalEntries|financeAggregates|countSessions/.test(combined), 'I2L introduces no accounting posting or Count mutation');
check(!service.includes('buildDocumentFieldRoleHints'), 'I2L adds no client service/API operation');
check(!gateway.includes('field-role-hints'), 'I2L adds no new finance gateway operation');
check(!pdfTextHandler.includes('buildDocumentFieldRoleHints'), 'certified I2G handler remains separate from I2L client-side semantics');

console.log(`\nUniversal Evidence Deterministic Field Role Hints UI I2L totals: ${passed} Passed`);
