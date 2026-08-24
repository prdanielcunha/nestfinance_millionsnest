import { readFile } from 'node:fs/promises';
import { detectDocumentTextSignals } from '../shared/finance/documentIntelligenceTextSignals.js';

let passed = 0;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
};

const panel = await readFile('src/pages/finance/inbox/UniversalEvidenceTextSignalsPanel.tsx', 'utf8');
const card = await readFile('src/pages/finance/inbox/UniversalEvidencePdfReadinessCard.tsx', 'utf8');
const copy = await readFile('src/pages/finance/inbox/pdfSignalsCopy.ts', 'utf8');
const service = await readFile('src/services/universalEvidenceInboxService.ts', 'utf8');
const gateway = await readFile('api/finance-gateway.ts', 'utf8');
const pdfTextHandler = await readFile('server/vercel-handlers/finance/universalEvidencePdfText.ts', 'utf8');

check(panel.includes("detectDocumentTextSignals") && panel.includes("../../../../shared/finance/documentIntelligenceTextSignals.js"), 'I2J reuses the certified I2I deterministic parser');
check(panel.includes('const analyzeSignals = () =>') && panel.includes('setSignals(detectDocumentTextSignals(text))'), 'signal analysis is an explicit local parser action');
check(panel.includes('onClick={analyzeSignals}'), 'signal analysis requires an explicit user click');
check(!panel.includes('useEffect('), 'signal panel has no lifecycle-triggered automatic analysis');
check(!panel.includes('universalEvidenceInboxService') && !panel.includes('fetch('), 'signal analysis adds no network request');
check(!/localStorage|sessionStorage|indexedDB/i.test(panel), 'signal candidates are not persisted in browser storage');
check(!panel.includes('dangerouslySetInnerHTML') && !panel.includes('innerHTML'), 'signal excerpts and context render as inert React text');

check(card.includes("extraction?.state === 'extracted'"), 'signal UX remains downstream of successful native text extraction');
check(card.includes('<UniversalEvidenceTextSignalsPanel text={extraction.text} />'), 'only the already-read native text is passed into the local signal panel');
check((card.match(/UniversalEvidenceTextSignalsPanel text=/g) || []).length === 1, 'detail flow renders exactly one deterministic signal panel');
check(card.includes('setExtraction(null)'), 're-reading or context reset removes the source text and unmounts prior signal state');
check(card.includes('[accessState.organizationId, activeFinanceEntityId, evidence.evidenceId]'), 'organization, entity or evidence switch resets the protected text context');

check(copy.includes('PT:') && copy.includes('EN:') && copy.includes('ES:'), 'I2J copy exists in PT, EN and ES');
check(copy.includes('candidatos de revisão') && copy.includes('review candidates') && copy.includes('candidatos para revisión'), 'all languages call detected signals review candidates');
check(copy.includes('não dados financeiros confirmados') && copy.includes('not confirmed financial data') && copy.includes('no datos financieros confirmados'), 'all languages explicitly reject confirmed-financial-fact semantics');
check(copy.includes('não adivinha') && copy.includes('does not guess') && copy.includes('no adivina'), 'empty-state copy refuses to guess missing or ambiguous fields');
check(copy.includes('100.000 caracteres') && copy.includes('100,000 characters') && copy.includes('100.000 caracteres'), 'all languages communicate the 100k scan boundary');
check(copy.includes('limite de 100 candidatos') && copy.includes('100-candidate limit') && copy.includes('límite de 100 candidatos'), 'all languages communicate the candidate fan-out boundary');
check(copy.includes('Somente padrão') && copy.includes('Pattern only') && copy.includes('Solo patrón'), 'pattern-only evidence is visibly distinct from validation');
check(copy.includes('Validado por regra') && copy.includes('Rule validated') && copy.includes('Validado por regla'), 'rule-validated evidence is visibly labeled');
check(copy.includes('Rótulo explícito') && copy.includes('Explicit label') && copy.includes('Etiqueta explícita'), 'explicit-label evidence is visibly labeled');
check(copy.includes('não são salvos') && copy.includes('are not saved') && copy.includes('no se guardan'), 'all languages state that signals are not saved');
check(copy.includes('OCR') && copy.includes('IA') && copy.includes('AI'), 'copy preserves zero OCR and zero AI semantics');

const sample = detectDocumentTextSignals('CNPJ 04.252.011/0001-10 | Total R$ 12,34 | Chave Pix: financeiro@example.org');
check(sample.candidates.some((candidate) => candidate.kind === 'cnpj' && candidate.evidence === 'validated'), 'I2J sample produces a rule-validated CNPJ candidate');
check(sample.candidates.some((candidate) => candidate.kind === 'money' && candidate.amountCents === 1234), 'I2J sample produces deterministic integer-cents money candidate');
check(sample.candidates.some((candidate) => candidate.kind === 'pix_key' && candidate.evidence === 'explicit_label'), 'I2J sample produces only explicitly labeled Pix evidence');

const combined = `${panel}\n${card}\n${copy}`;
check(!combined.includes('@google/genai') && !combined.includes('generateContent(') && !combined.includes('Gemini'), 'I2J introduces no AI execution path');
check(!combined.includes('firebase-admin') && !combined.includes('firestore'), 'I2J introduces no direct persistence path');
check(!/createJournal|createPosting|postTransaction|PostingPlan|balanceMutation|financeJournalEntries|financeAggregates/.test(combined), 'I2J introduces no accounting or posting action');

check(!service.includes('detectDocumentTextSignals'), 'I2J adds no client service/API operation');
check(!gateway.includes('universal-evidence-text-signals'), 'I2J adds no new finance gateway operation');
check(!pdfTextHandler.includes('detectDocumentTextSignals'), 'certified I2G server handler remains separate from I2J client-side signals');

console.log(`\nUniversal Evidence Deterministic Text Signals UI I2J totals: ${passed} Passed`);
