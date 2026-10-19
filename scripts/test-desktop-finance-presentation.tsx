import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TodayLedgerOverview } from '../src/pages/finance/TodayLedgerOverview';
import type { TodayOperationalSnapshot } from '../shared/finance/todayOperationalSummary';
const operational: TodayOperationalSnapshot = { localDate: '2026-10-18', incomeCents: 123400, expenseCents: 8700, dueSoonCount: 2, dueSoonTruncated: true,
  registeredPayablesDueSoonCount: 1, balance: { state: 'available', amountCents: 456700, reason: null },
  source: { deterministic: true, aiUsedForTotals: false, dueDatesMayComeFromReviewedOrProposedDocumentAnalysis: true, balanceUsesPostedTransactionsOnly: true } };
const props = { language: 'PT' as const, entityName: 'Synthetic church <script>', operational, countInProgress: null, transactionsToReview: 3, documentsToReview: 2,
  nextTitle: 'Synthetic healthy result', nextDescription: 'Synthetic next step', nextAction: 'Synthetic action', onNext() {}, onRegister() {}, canRegister: true, canViewBalance: true, onCount() {}, canCount: true, onRetry() {} };
const before = JSON.stringify(operational);
for (const language of ['PT', 'EN', 'ES'] as const) {
  for (const extra of [{ canViewBalance: false }, { operational: { ...operational, balance: { state: 'restricted', amountCents: null, reason: 'permission_required' } as const } }]) {
    const restricted = renderToStaticMarkup(<TodayLedgerOverview {...props} language={language} {...extra} />);
    assert.ok(!restricted.includes('4.567') && !restricted.includes('4,567'), 'A balance must never exist in restricted HTML, including hidden details');
    assert.ok(restricted.includes('1.234') || restricted.includes('1,234') || restricted.includes('1234,00'), 'Recording/viewing daily movements remains independent from balance visibility');
  }
}
const ready = renderToStaticMarkup(<TodayLedgerOverview {...props} />);
assert.ok(ready.includes('4.567,00') && ready.includes('1.234,00') && ready.includes('87,00'));
assert.ok(ready.includes('podem incluir rascunhos'), 'Daily operational movements cannot be presented as posted cash');
assert.ok(ready.includes('Synthetic healthy result') && ready.includes('Contar culto'));
assert.ok(ready.includes('&lt;script&gt;') && !ready.includes('<script>'));
for (const state of ['loading', 'error'] as const) {
  const html = renderToStaticMarkup(<TodayLedgerOverview {...props} operational={null} priorityState={state} />);
  assert.ok(!html.includes('Synthetic healthy result') && !html.includes('Synthetic action'), 'Incomplete sources must not claim a healthy priority or execute its CTA');
  assert.ok(html.includes('Atualizar resumo'));
  assert.ok(!html.includes('R$'), 'Unavailable data must never become a fabricated zero balance');
  assert.ok(state === 'loading' ? html.includes('disabled=') : html.includes('Não foi possível confirmar'));
}
const noActions = renderToStaticMarkup(<TodayLedgerOverview {...props} canRegister={false} canCount={false} />);
assert.ok(!noActions.includes('Registrar entrada ou despesa') && !noActions.includes('Contar culto'));
const zero = renderToStaticMarkup(<TodayLedgerOverview {...props} operational={{ ...operational, balance: { state: 'available', amountCents: 0, reason: null } }} />);
assert.ok(zero.includes('0,00'), 'A real verified zero must remain distinguishable from unavailable data');
for (const language of ['EN', 'ES'] as const) {
  const html = renderToStaticMarkup(<TodayLedgerOverview {...props} language={language} priorityState="error" />);
  assert.ok(!html.includes('Não foi possível confirmar') && !html.includes('Sua próxima ação'));
}
assert.equal(JSON.stringify(operational), before, 'Presentation cannot change financial input');
const source = readFileSync('src/pages/finance/TodayActionCenter.tsx', 'utf8');
assert.ok(source.includes('onRetry={() => void Promise.all([loadSummary(), loadCounts(), loadInbox(), loadSignals(), loadRecent()])}'), 'Retry must use loaders that clear and update loading/failure states');
console.log('✅ Desktop presentation: actual money, draft disclosure, unknown vs zero, honest error/loading, safe action visibility, i18n, immutable input and state-aware retry');
