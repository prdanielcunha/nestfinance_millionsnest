import * as fs from 'fs';
import * as path from 'path';
import { COUNT_COPY } from '../src/pages/finance/count/countCopy';
import {
  COUNT_DENOMINATIONS_CENTS,
  COUNT_ENTRY_TYPES,
  COUNT_SESSION_STATUSES,
  buildCountMaterialFingerprint,
  calculateDenominationTotalCents,
  compareCountEntries,
  normalizeCountEntries,
} from '../shared/finance/count';

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    failed++;
  }
}

const home = fs.readFileSync(path.resolve('src/pages/finance/CountPage.tsx'), 'utf8');
const session = fs.readFileSync(path.resolve('src/pages/finance/count/CountSessionPage.tsx'), 'utf8');
const h2Panels = fs.readFileSync(path.resolve('src/pages/finance/count/CountH2Panels.tsx'), 'utf8');
const service = fs.readFileSync(path.resolve('src/services/countService.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const gateway = fs.readFileSync(path.resolve('api/finance-gateway.ts'), 'utf8');
const detailHandler = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsDetail.ts'), 'utf8');
const listHandler = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsList.ts'), 'utf8');
const startSecond = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsStartSecondCount.ts'), 'utf8');
const submitSecond = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsSubmitSecondCount.ts'), 'utf8');
const startRecount = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsStartRecount.ts'), 'utf8');
const submitRecount = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countSessionsSubmitRecount.ts'), 'utf8');
const h2Backend = [detailHandler, listHandler, startSecond, submitSecond, startRecount, submitRecount].join('\n');

console.log('Running Count 2.0 H1/H2 product checks...');

verify('Count home is no longer placeholder', !home.includes('FinancePlaceholderPage'));
verify('Count home keeps finance.view gate', home.includes("'finance.view'"));
verify('Count create keeps finance.create_drafts gate', home.includes("'finance.create_drafts'"));
verify('Count session keeps finance.view gate', session.includes("'finance.view'"));
verify('Count session edit keeps finance.create_drafts gate', session.includes("'finance.create_drafts'"));
verify('Count has dedicated session route', routes.includes("countSession: '/finance/count/:sessionId'"));
verify('router lazy-loads Count session page', router.includes('CountSessionPage') && router.includes('APP_ROUTES.countSession'));
verify('Count H1 uses four certified gateway operations', ['count-sessions-list', 'count-sessions-create', 'count-sessions-detail', 'count-sessions-save-first-count'].every((operation) => service.includes(operation) && gateway.includes(`case '${operation}'`)));
verify('Count H2 uses four certified gateway operations', ['count-sessions-start-second-count', 'count-sessions-submit-second-count', 'count-sessions-start-recount', 'count-sessions-submit-recount'].every((operation) => service.includes(operation) && gateway.includes(`case '${operation}'`)));
verify('Count supports all four entry types', COUNT_ENTRY_TYPES.length === 4 && ['tithe', 'offering', 'other', 'pix'].every((type) => COUNT_ENTRY_TYPES.includes(type as any)));
verify('Count H2 exposes explicit safe statuses', ['counting_a', 'counting_b', 'matched', 'divergent', 'recounting'].every((status) => COUNT_SESSION_STATUSES.includes(status as any)));
verify('Count exposes denomination and direct total modes', session.includes("'denominations'") && session.includes("'total'") && h2Panels.includes("'denominations'") && h2Panels.includes("'total'"));
verify('Count controls meet 48px touch target', session.includes('h-12 w-12') && h2Panels.includes('h-12 w-12'));
verify('Count review explicitly explains second-count safety', session.includes('secondCountSafety') && session.includes('secondCountPending'));
verify('Count UI explicitly explains no posting/balance change', home.includes('noPosting') && session.includes('noPosting') && h2Panels.includes('noPosting'));
verify('Count has no close/finalize/posting action', !/finalizeCount|closeCount|approveForPosting|getPostingPlanPreview|posting-real|ledger-post/.test(`${home}\n${session}\n${h2Panels}\n${service}`));
verify('Count H2 backend has no journal/aggregate/transaction collection mutation reference', !/financeTransactions|financeJournalEntries|financeJournalLines|financeAggregates/.test(h2Backend));
verify('Count does not persist financial data in localStorage', !/localStorage/.test(`${home}\n${session}\n${h2Panels}\n${service}`));

verify('blind detail masks both A and B during counting_b/recounting', detailHandler.includes("data.status === 'counting_b' || data.status === 'recounting'") && detailHandler.includes('session.countA = null') && detailHandler.includes('session.countB = null') && detailHandler.includes('session.comparison = null'));
verify('blind list masks first-count amount and entry types', listHandler.includes('firstCountTotalCents: materialHidden ? null') && listHandler.includes('firstCountEntryTypes: materialHidden'));
verify('second count starts only from counting_a', startSecond.includes("session.status !== 'counting_a'") && startSecond.includes("status: 'counting_b'"));
verify('second count requires first-count evidence', startSecond.includes('COUNT_FIRST_COUNT_REQUIRED'));
verify('second count comparison runs server-side', submitSecond.includes('compareCountEntries(session.countA.entries, normalizedEntries)'));
verify('recount starts only from divergent state', startRecount.includes("session.status !== 'divergent'") && startRecount.includes("status: 'recounting'"));
verify('recount preserves previous attempts rather than overwriting A/B', submitRecount.includes('recountAttempts: [...previousAttempts, sealedAttempt]') && !submitRecount.includes('countA:') && !submitRecount.includes('countB:'));
verify('recount resolves only by matching preserved A or B', submitRecount.includes('matchesA || matchesB') && submitRecount.includes("'recount_matches_a'") && submitRecount.includes("'recount_matches_b'"));
verify('blind workspace receives no Count A/B material values', !/session\.countA|session\.countB|session\.comparison/.test(h2Panels.split('export function CountResultPanel')[0]));

verify('denomination set includes notes and coins', [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5].every((value) => COUNT_DENOMINATIONS_CENTS.includes(value as any)));
verify('denomination math is deterministic', calculateDenominationTotalCents({ '10000': 2, '5000': 1, '100': 3, '25': 4 }) === 25400);
verify('server normalization recomputes denomination total', normalizeCountEntries([{ type: 'tithe', method: 'denominations', totalCents: 999999, denominations: { '10000': 1, '200': 2 } }])[0].totalCents === 10400);
verify('Pix only uses direct total', normalizeCountEntries([{ type: 'pix', method: 'total', totalCents: 12345 }])[0].channel === 'pix');

const comparisonMatch = compareCountEntries(
  [{ type: 'tithe', method: 'total', totalCents: 10000 }, { type: 'pix', method: 'total', totalCents: 5000 }],
  [{ type: 'pix', method: 'total', totalCents: 5000 }, { type: 'tithe', method: 'total', totalCents: 10000 }],
);
verify('A/B comparison is order-independent and deterministic', comparisonMatch.matched && comparisonMatch.differences.length === 0 && comparisonMatch.totalDeltaCents === 0);
const comparisonDiff = compareCountEntries(
  [{ type: 'offering', method: 'total', totalCents: 10000 }],
  [{ type: 'offering', method: 'total', totalCents: 10300 }],
);
verify('A/B comparison identifies exact entry delta', !comparisonDiff.matched && comparisonDiff.differences.length === 1 && comparisonDiff.differences[0].type === 'offering' && comparisonDiff.differences[0].deltaCents === 300);

const baseFingerprint = buildCountMaterialFingerprint({
  serviceLabel: 'Sunday',
  serviceDate: '2026-08-14',
  entries: [{ type: 'offering', method: 'total', totalCents: 10000 }],
});
verify('Count fingerprint changes with material amount', baseFingerprint !== buildCountMaterialFingerprint({
  serviceLabel: 'Sunday',
  serviceDate: '2026-08-14',
  entries: [{ type: 'offering', method: 'total', totalCents: 10001 }],
}));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = COUNT_COPY[language];
  verify(`${language} Count home copy is complete`, Boolean(copy.homeTitle && copy.homeSubtitle && copy.newSession && copy.recentSessions));
  verify(`${language} Count first-count flow copy is complete`, Boolean(copy.chooseTitle && copy.countTitle(copy.entryLabels.tithe) && copy.reviewTitle && copy.grandTotal));
  verify(`${language} Count covers all entry labels`, Boolean(copy.entryLabels.tithe && copy.entryLabels.offering && copy.entryLabels.other && copy.entryLabels.pix));
  verify(`${language} Count explains independent second count`, Boolean(copy.secondCountSafety && copy.blindTitle && copy.blindBody && copy.blindStillHidden));
  verify(`${language} Count covers H2 result/recount copy`, Boolean(copy.matchTitle && copy.divergentTitle && copy.startRecount && copy.recountBlindTitle && copy.originalEvidence));
  verify(`${language} Count explains no posting`, Boolean(copy.noPosting));
}

console.log(`\nCount 2.0 H1/H2 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
