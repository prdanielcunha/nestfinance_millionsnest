import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyUniversalDocumentIntent,
  parseUniversalTextIntent,
} from '../shared/finance/universalInputIntent.js';

const read = (path: string) => readFileSync(path, 'utf8');
const fixedNow = new Date('2026-09-23T12:00:00-03:00');

const expense = parseUniversalTextIntent('Paguei R$ 150 no Pix hoje', fixedNow);
assert.equal(expense.direction, 'expense');
assert.equal(expense.amountCents, 15000);
assert.equal(expense.paymentMethod, 'pix');
assert.equal(expense.occurredAt, '2026-09-23');
assert.equal(expense.confidence, 'high');

const dated = parseUniversalTextIntent('23/09/2026 paguei 150,50 em dinheiro', fixedNow);
assert.equal(dated.direction, 'expense');
assert.equal(dated.amountCents, 15050);
assert.equal(dated.paymentMethod, 'cash');
assert.equal(dated.occurredAt, '2026-09-23');

const income = parseUniversalTextIntent('Recebi 500 de oferta ontem', fixedNow);
assert.equal(income.direction, 'income');
assert.equal(income.amountCents, 50000);
assert.equal(income.occurredAt, '2026-09-22');

const transfer = parseUniversalTextIntent('Transferi R$ 320 hoje', fixedNow);
assert.equal(transfer.direction, 'transfer');
assert.equal(transfer.amountCents, 32000);

assert.equal(classifyUniversalDocumentIntent({ filename: 'comprovante-pix.png' }), 'payment_proof');
assert.equal(classifyUniversalDocumentIntent({ filename: 'extrato-setembro.pdf' }), 'bank_statement');
assert.equal(classifyUniversalDocumentIntent({ filename: 'nota-fiscal-123.pdf' }), 'invoice');
assert.equal(classifyUniversalDocumentIntent({ filename: 'recibo.jpg' }), 'receipt');
assert.equal(classifyUniversalDocumentIntent({ filename: 'DARF.pdf' }), 'tax_document');
assert.equal(classifyUniversalDocumentIntent({ filename: 'arquivo.pdf' }), 'other');

const capturePage = read('src/pages/finance/capture/UniversalCapturePage.tsx');
const quickText = read('src/pages/finance/capture/UniversalQuickTextEntry.tsx');
const offlineQueue = read('src/services/universalCaptureOfflineQueue.ts');
const sharedEvidence = read('shared/finance/universalEvidence.ts');
const finalize = read('server/vercel-handlers/finance/universalEvidenceFinalize.ts');
const review = read('src/pages/finance/transactions/TransactionReviewDetailPage.tsx');
const reconciliation = read('src/pages/finance/balance/ReconciliationMatchPreviewPanel.tsx');
const manifest = JSON.parse(read('public/brand/nestfinance/nest-flow-signature/v1/manifest/site.webmanifest'));
const sw = read('public/nestfinance-share-target-sw.js');
const main = read('src/main.tsx');

assert.ok(capturePage.includes('navigator.clipboard.read()'));
assert.ok(capturePage.includes("addFiles(files, 'clipboard')"));
assert.ok(capturePage.includes("addFiles(payload.files, 'share_target'"));
assert.ok(capturePage.includes('UniversalQuickTextEntry'));
assert.ok(capturePage.includes('classifyUniversalDocumentIntent'));
assert.ok(capturePage.includes('universalEvidenceInboxService.classify'));
assert.ok(capturePage.indexOf('universalEvidenceInboxService.classify') < capturePage.indexOf('universalEvidenceInboxService.analyzeTransaction'));
assert.ok(capturePage.includes('copy.intentWrong'));
assert.ok(capturePage.includes('copy.intentLabels[item.intent]'));
assert.ok(capturePage.includes('universalCaptureOfflineQueue.put'));
assert.ok(capturePage.includes('universalCaptureOfflineQueue.list'));
assert.ok(capturePage.includes('!online'));
assert.ok(capturePage.includes('disabled={processing || !hasProcessable || !online}'));

assert.ok(quickText.includes('parseUniversalTextIntent'));
assert.ok(quickText.includes('SpeechRecognition'));
assert.ok(quickText.includes('webkitSpeechRecognition'));
assert.ok(quickText.includes("sourceContext: 'universal_text'"));
assert.ok(quickText.includes('transactionsService.createDraft'));
assert.ok(quickText.includes('Entendeu errado?'));
assert.ok(quickText.includes('Did I get it wrong?'));
assert.ok(quickText.includes('¿Entendió mal?'));
assert.ok(quickText.includes('localStorage.setItem'));
assert.ok(quickText.includes('!online'));
for (const forbidden of ['approveForPosting', 'reconciliationService', 'financeJournalEntries', "status: 'posted'"]) {
  assert.ok(!quickText.includes(forbidden), 'quick input must not perform final financial action: ' + forbidden);
}

assert.ok(offlineQueue.includes("const CACHE_NAME = 'nestfinance-universal-capture-offline-v1'"));
assert.ok(offlineQueue.includes('caches.open'));
assert.ok(offlineQueue.includes('new File'));
assert.ok(!offlineQueue.includes('firebase'));
assert.ok(!offlineQueue.includes('financeTransactions'));

assert.equal(manifest.share_target.action, '/finance/capture/share-target');
assert.equal(manifest.share_target.method, 'POST');
assert.equal(manifest.share_target.enctype, 'multipart/form-data');
assert.ok(Array.isArray(manifest.share_target.params.files));
assert.ok(sw.includes("event.request.method !== 'POST'"));
assert.ok(sw.includes("url.pathname !== ACTION"));
assert.ok(sw.includes('event.request.formData()'));
assert.ok(sw.includes('caches.open(CACHE_NAME)'));
assert.ok(sw.includes('/finance/capture?shareTarget='));
assert.ok(main.includes("navigator.serviceWorker.register('/nestfinance-share-target-sw.js'"));

assert.ok(sharedEvidence.includes("'share_target'"));
assert.ok(finalize.includes("collection('universalEvidenceHashes')"));
assert.ok(finalize.includes('stageFinanceSignal'));
assert.ok(finalize.includes('financialRecognition: false'));

assert.ok(review.includes('useOnlineStatus'));
assert.ok(review.includes('approvalDisabled = reviewBlocked || actionState !== null || !online'));
assert.ok(review.includes('if (actionState || !data?.transaction || !online) return'));

assert.ok(reconciliation.includes('useOnlineStatus'));
assert.ok(reconciliation.includes('if (!pendingConfirmation || confirming || !canConfirm || !online) return'));
assert.ok(reconciliation.includes('candidate.reconciliationEligible'));
assert.ok(reconciliation.includes('canConfirm'));
assert.ok(reconciliation.includes('online'));
assert.ok(reconciliation.includes('!line.candidateLimitReached'));

console.log('✅ Roadmap Cycle 06 universal input gate passed');
