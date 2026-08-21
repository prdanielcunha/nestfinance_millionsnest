import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile('src/services/universalEvidenceInboxService.ts', 'utf8');
const card = await readFile('src/pages/finance/inbox/UniversalEvidencePdfReadinessCard.tsx', 'utf8');
const page = await readFile('src/pages/finance/inbox/UniversalEvidenceDetailPage.tsx', 'utf8');
const copy = await readFile('src/pages/finance/inbox/pdfReadinessCopy.ts', 'utf8');

let passed = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed += 1;
  console.log(`✅ ${message}`);
};

check(service.includes("operation=universal-evidence-pdf-inspect"), 'service reuses the certified I2D gateway operation');
check(service.includes("method: 'POST'"), 'readiness request uses POST');
check(service.includes('await buildHeaders(organizationId)'), 'readiness request uses canonical authenticated headers');
check(service.includes('JSON.stringify({ financeEntityId, evidenceId })'), 'request body contains only entity and evidence identifiers');
check((service.match(/inspectPdfTextLayer\(/g) || []).length === 1, 'service exposes one PDF readiness method');

check(card.includes("evidence.verifiedMimeType === 'application/pdf'"), 'card is limited to verified PDFs');
check(card.includes("state === 'accepted' || state === 'duplicate'"), 'card is limited to finalized evidence');
check(card.includes('evidence.verification.immutableOriginal'), 'card requires immutable original verification');
check(card.includes('evidence.verification.mimeVerified'), 'card requires MIME verification');
check(card.includes('evidence.verification.sizeVerified'), 'card requires size verification');
check(card.includes('evidence.verification.contentHashVerified'), 'card requires hash verification');
check(card.includes('onClick={() => void inspect()}'), 'analysis is triggered only by explicit user action');
check((card.match(/inspectPdfTextLayer\(/g) || []).length === 1, 'component has exactly one I2D service call site');
check(!/useEffect\([\s\S]{0,500}inspect\(\)/.test(card), 'no effect automatically triggers PDF inspection');
check(card.includes('[accessState.organizationId, activeFinanceEntityId, evidence.evidenceId]'), 'analysis state resets on canonical context or evidence change');
check(card.includes("analysis?.textLayerState === 'detected'"), 'detected state is rendered explicitly');
check(card.includes("analysis?.textLayerState === 'not_detected'"), 'not_detected state is rendered explicitly');
check(card.includes('copy.unknownTitle'), 'unknown state is rendered fail-closed');
check(card.includes("aria-live=\"polite\""), 'result announcement is accessible');

check(page.includes('<UniversalEvidencePdfReadinessCard evidence={evidence} />'), 'detail page renders readiness card exactly for the loaded evidence');
check((page.match(/UniversalEvidencePdfReadinessCard evidence=/g) || []).length === 1, 'detail page renders a single readiness card');

check(copy.includes('PT:') && copy.includes('EN:') && copy.includes('ES:'), 'readiness copy exists in PT, EN and ES');
check(copy.includes('Isso não prova que o PDF não tenha texto'), 'PT copy preserves not_detected semantic boundary');
check(copy.includes('This does not prove that the PDF has no text'), 'EN copy preserves not_detected semantic boundary');
check(copy.includes('Esto no demuestra que el PDF no tenga texto'), 'ES copy preserves not_detected semantic boundary');
check(copy.includes('OCR continua desativado') && copy.includes('OCR remains disabled') && copy.includes('OCR permanece desactivado'), 'all languages state that OCR remains disabled');
check(copy.includes('Nenhum lançamento financeiro é criado') && copy.includes('No financial entry is created') && copy.includes('No se crea ningún asiento financiero'), 'all languages preserve zero-accounting-action boundary');

const combined = `${service}\n${card}\n${page}\n${copy}`;
check(!combined.includes('@google/genai'), 'I2E readiness UX introduces no AI dependency');
check(!combined.includes('generateContent('), 'I2E readiness UX makes no model call');
check(!combined.includes('firebase-admin'), 'I2E readiness UX introduces no direct server persistence path');
check(!combined.includes('universal-evidence-pdf-text'), 'experimental native text endpoint is not part of readiness slice');

console.log(`\nUniversal Evidence PDF Readiness I2E totals: ${passed} Passed`);
