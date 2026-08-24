import assert from 'assert';
import { readFileSync } from 'fs';

const component = readFileSync('src/pages/finance/inbox/UniversalEvidencePdfReadinessCard.tsx', 'utf8');
const service = readFileSync('src/services/universalEvidenceInboxService.ts', 'utf8');
const copy = readFileSync('src/pages/finance/inbox/pdfTextCopy.ts', 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

check('reuses the certified canonical I2G operation', () => {
  assert.ok(service.includes("operation=universal-evidence-pdf-text"));
});

check('native text request remains POST-only from the client', () => {
  const block = service.match(/async extractPdfNativeText[\s\S]*?return response\.json\(\);/i)?.[0] || '';
  assert.ok(block.includes("method: 'POST'"));
});

check('native text request body contains only entity and evidence identifiers', () => {
  const block = service.match(/async extractPdfNativeText[\s\S]*?return response\.json\(\);/i)?.[0] || '';
  assert.ok(block.includes('JSON.stringify({ financeEntityId, evidenceId })'));
  assert.ok(!block.includes('organizationId,'));
  assert.ok(!block.includes('text:'));
});

check('uses canonical organization headers', () => {
  const block = service.match(/async extractPdfNativeText[\s\S]*?return response\.json\(\);/i)?.[0] || '';
  assert.ok(block.includes('buildHeaders(organizationId)'));
});

check('keeps verified finalized PDF eligibility', () => {
  assert.ok(component.includes("state === 'accepted' || state === 'duplicate'"));
  assert.ok(component.includes('evidence.version === 2'));
  assert.ok(component.includes("evidence.verifiedMimeType === 'application/pdf'"));
  assert.ok(component.includes('evidence.verification.immutableOriginal'));
  assert.ok(component.includes('evidence.verification.mimeVerified'));
  assert.ok(component.includes('evidence.verification.sizeVerified'));
  assert.ok(component.includes('evidence.verification.contentHashVerified'));
});

check('requires a safe deterministic readiness result before exposing native read action', () => {
  assert.ok(component.includes("analysis?.textLayerState === 'detected'"));
  assert.ok(component.includes('analysis.encrypted === false'));
  assert.ok(component.includes('analysis.unsupportedStreams === 0'));
  assert.ok(component.includes('analysis.limited === false'));
});

check('native extraction runs only from explicit user action', () => {
  assert.ok(component.includes('const readNativeText = async () =>'));
  assert.ok(component.includes('onClick={() => void readNativeText()}'));
  const effect = component.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[accessState\.organizationId, activeFinanceEntityId, evidence\.evidenceId\]\);/)?.[1] || '';
  assert.ok(!effect.includes('extractPdfNativeText'));
  assert.ok(!effect.includes('readNativeText'));
});

check('has one client call site for native extraction', () => {
  assert.strictEqual((component.match(/universalEvidenceInboxService\.extractPdfNativeText\(/g) || []).length, 1);
});

check('guards stale asynchronous responses with an epoch', () => {
  assert.ok(component.includes('const epoch = ++epochRef.current'));
  assert.ok(component.includes('if (epoch !== epochRef.current) return;'));
});

check('resets extracted text on organization, entity, or evidence context changes', () => {
  assert.ok(component.includes('setExtraction(null)'));
  assert.ok(component.includes('setTextErrorDetails(null)'));
  assert.ok(component.includes('[accessState.organizationId, activeFinanceEntityId, evidence.evidenceId]'));
});

check('renders extracted and unavailable states explicitly', () => {
  assert.ok(component.includes("extraction?.state === 'unavailable'"));
  assert.ok(component.includes("extraction?.state === 'extracted'"));
  assert.ok(component.includes('textCopy.reasons[extraction.reason]'));
});

check('surfaces truncation and extraction metadata', () => {
  assert.ok(component.includes('extraction.truncated'));
  assert.ok(component.includes('extraction.extractedPages'));
  assert.ok(component.includes('extraction.totalPages'));
  assert.ok(component.includes('extraction.characters'));
});

check('renders native text as inert React text, never HTML', () => {
  assert.ok(component.includes('{extraction.text}'));
  assert.ok(!component.includes('dangerouslySetInnerHTML'));
  assert.ok(!component.includes('innerHTML'));
});

check('does not persist extracted text in browser storage', () => {
  const combined = `${component}\n${service}`;
  assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(combined));
});

check('does not introduce OCR or AI client execution', () => {
  const combined = `${component}\n${service}\n${copy}`;
  assert.ok(!combined.includes('@google/genai'));
  assert.ok(!combined.includes('generateContent'));
  assert.ok(!combined.includes('Gemini'));
});

check('client contract preserves explicit zero-AI and zero-financial-recognition fields', () => {
  assert.ok(service.includes('aiUsed: false'));
  assert.ok(service.includes('ocrUsed: false'));
  assert.ok(service.includes('financialRecognition: false'));
});

check('supports PT EN and ES copy', () => {
  assert.ok(copy.includes('PT:'));
  assert.ok(copy.includes('EN:'));
  assert.ok(copy.includes('ES:'));
});

check('all languages say native text is not saved and OCR/AI stay out of the flow', () => {
  assert.ok(copy.includes('não é salvo pelo NestFinance'));
  assert.ok(copy.includes('is not saved by NestFinance'));
  assert.ok(copy.includes('NestFinance no lo guarda'));
  assert.ok((copy.match(/OCR/g) || []).length >= 3);
  assert.ok(/IA/.test(copy) && /AI/.test(copy));
});

check('communicates hard safety limits', () => {
  assert.ok(copy.includes('4 MiB'));
  assert.ok(copy.includes('40 páginas'));
  assert.ok(copy.includes('40-page'));
  assert.ok(copy.includes('100.000 caracteres'));
  assert.ok(copy.includes('100,000 characters'));
});

check('does not create accounting or posting actions', () => {
  const combined = `${component}\n${service}`;
  assert.ok(!/createJournal|createPosting|postTransaction|PostingPlan|journalEntry|balanceMutation/i.test(combined));
});

console.log(`\nI2H PDF Native Text UX: ${passed} Passed`);
