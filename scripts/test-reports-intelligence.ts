import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildReportsIntelligence,
  previousPeriodKey,
} from '../shared/finance/reportsIntelligence.js';
import { buildPeriodCloseReadiness } from '../shared/finance/periodCloseReadiness.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(previousPeriodKey('2026-09') === '2026-08', 'previous month is deterministic');
verify(previousPeriodKey('2026-01') === '2025-12', 'year boundary resolves correctly');

const period = (key: string, income: number, expense: number, statuses: string[], reconciled = true) =>
  buildPeriodCloseReadiness({
    financeEntityId: 'entity-a',
    periodKey: key,
    startDate: key + '-01',
    endDateExclusive: key === '2026-09' ? '2026-10-01' : '2026-09-01',
    configuredBankAccountIds: ['bank-a'],
    transactions: statuses.map((status, index) => ({
      transactionKind: index % 2 === 0 ? 'income' : 'expense',
      status,
      amountCents: index % 2 === 0 ? income : expense,
      accountId: 'bank-a',
      reconciliationStatus: reconciled ? 'reconciled' : 'unreconciled',
    })),
    countSessions: [{ status: 'matched' }, { status: 'matched' }],
    evidence: [
      { processingState: 'accepted', duplicate: false, humanClassified: true, reviewStatus: 'reviewed' },
      { processingState: 'accepted', duplicate: false, humanClassified: true, reviewStatus: 'reviewed' },
    ],
  });

const current = period('2026-09', 15000, 5000, ['posted', 'posted'], true);
const previous = period('2026-08', 10000, 7000, ['posted', 'draft'], false);
const result = buildReportsIntelligence({ current, previous });

verify(result.currentPeriodKey === '2026-09' && result.comparisonPeriodKey === '2026-08', 'response names both periods');
verify(result.currentSnapshot === current, 'response reuses the canonical current snapshot');
verify(result.metrics.recordedIncomeCents.current === 15000, 'current recorded income is preserved');
verify(result.metrics.recordedIncomeCents.delta === 5000, 'income delta is deterministic');
verify(result.metrics.recordedExpenseCents.delta === -2000, 'expense delta preserves direction without judgment');
verify(result.metrics.transactionCount.current === 2, 'transaction volume comes from canonical snapshot');
verify(result.authority.readOnly === true, 'comparison is explicitly read-only');
verify(result.authority.financialMutation === false, 'comparison has no financial mutation authority');
verify(result.authority.closeMutation === false, 'comparison has no close authority');
verify(result.authority.officialReport === false, 'comparison is not an official accounting report');
verify(result.authority.causalInference === false, 'comparison cannot claim causal inference');
verify(result.quality.postingRateBasisPoints.current === 10000, 'posting quality uses basis points');
verify(result.quality.postingRateBasisPoints.previous === 5000, 'previous posting quality is comparable');

const empty = buildPeriodCloseReadiness({
  financeEntityId: 'entity-a',
  periodKey: '2026-07',
  startDate: '2026-07-01',
  endDateExclusive: '2026-08-01',
  configuredBankAccountIds: [],
  transactions: [],
  countSessions: [],
  evidence: [],
});
const noActivity = buildReportsIntelligence({ current: empty, previous: empty });
verify(noActivity.quality.reconciliationRateBasisPoints.current === null, 'no bank activity is not misreported as zero-percent reconciliation');
verify(noActivity.quality.countMatchedRateBasisPoints.current === null, 'no counts are not misreported as zero-percent quality');

const handler = readFileSync('server/vercel-handlers/finance/reportsIntelligence.ts', 'utf8');
const page = readFileSync('src/pages/finance/ReportsPage.tsx', 'utf8');
const service = readFileSync('src/services/periodCloseService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.view')"), 'reports intelligence requires finance.view');
verify(handler.includes("Cache-Control', 'private, no-store"), 'reports intelligence disables shared caching');
verify(!handler.includes('stageFinanceFact') && !handler.includes('stageFinanceSignal'), 'reports intelligence does not create facts or signals');
verify(!handler.includes('.set(') && !handler.includes('.update(') && !handler.includes('.delete('), 'reports intelligence handler has no write calls');
verify(service.includes('operation=reports-intelligence'), 'client uses certified intelligence operation');
verify(gateway.includes("case 'reports-intelligence'"), 'gateway exposes reports intelligence');
verify(page.includes('Leitura comparativa') && page.includes('Comparative view') && page.includes('Vista comparativa'), 'comparison UX is localized in PT/EN/ES');
verify(page.includes('não atribui causa') && page.includes('does not assign cause') && page.includes('no atribuye causa'), 'UX rejects causal storytelling');
verify(page.includes('Não se aplica') && page.includes('Not applicable') && page.includes('No aplica'), 'zero-denominator quality is honestly labeled');

console.log('\nReports Intelligence totals: ' + passed + ' Passed');
