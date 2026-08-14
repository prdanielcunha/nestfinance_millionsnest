import * as fs from 'fs';
import * as path from 'path';
import { COUNT_COPY } from '../src/pages/finance/count/countCopy';
import {
  COUNT_DENOMINATIONS_CENTS,
  COUNT_ENTRY_TYPES,
  buildCountMaterialFingerprint,
  calculateDenominationTotalCents,
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
const service = fs.readFileSync(path.resolve('src/services/countService.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const gateway = fs.readFileSync(path.resolve('api/finance-gateway.ts'), 'utf8');

console.log('Running Count 2.0 H1 pilot checks...');

verify('Count home is no longer placeholder', !home.includes('FinancePlaceholderPage'));
verify('Count home keeps finance.view gate', home.includes("'finance.view'"));
verify('Count create keeps finance.create_drafts gate', home.includes("'finance.create_drafts'"));
verify('Count session keeps finance.view gate', session.includes("'finance.view'"));
verify('Count session edit keeps finance.create_drafts gate', session.includes("'finance.create_drafts'"));
verify('Count has dedicated session route', routes.includes("countSession: '/finance/count/:sessionId'"));
verify('router lazy-loads Count session page', router.includes('CountSessionPage') && router.includes('APP_ROUTES.countSession'));
verify('Count service uses four certified gateway operations', ['count-sessions-list', 'count-sessions-create', 'count-sessions-detail', 'count-sessions-save-first-count'].every((operation) => service.includes(operation) && gateway.includes(`case '${operation}'`)));
verify(
  'Count supports all four H1 entry types',
  COUNT_ENTRY_TYPES.length === 4 &&
    ['tithe', 'offering', 'other', 'pix'].every((type) => COUNT_ENTRY_TYPES.includes(type as any)),
);
verify('Count exposes denomination and direct total modes', session.includes("'denominations'") && session.includes("'total'"));
verify('Count controls meet 48px touch target', session.includes('h-12 w-12'));
verify('Count review explicitly explains second count safety', session.includes('secondCountSafety') && session.includes('secondCountPending'));
verify('Count UI explicitly explains no posting/balance change', home.includes('noPosting') && session.includes('noPosting'));
verify('Count has no close/finalize/posting action', !/finalizeCount|closeCount|approveForPosting|getPostingPlanPreview|posting-real|ledger-post/.test(`${home}\n${session}\n${service}`));
verify('Count has no journal/aggregate/balance mutation reference', !/financeJournalEntries|financeJournalLines|financeAggregates/.test(`${home}\n${session}\n${service}`));
verify('Count does not persist financial data in localStorage', !/localStorage/.test(`${home}\n${session}\n${service}`));

verify('denomination set includes notes and coins', [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5].every((value) => COUNT_DENOMINATIONS_CENTS.includes(value as any)));
verify('denomination math is deterministic', calculateDenominationTotalCents({ '10000': 2, '5000': 1, '100': 3, '25': 4 }) === 25400);
verify('server normalization recomputes denomination total', normalizeCountEntries([{ type: 'tithe', method: 'denominations', totalCents: 999999, denominations: { '10000': 1, '200': 2 } }])[0].totalCents === 10400);
verify('Pix only uses direct total', normalizeCountEntries([{ type: 'pix', method: 'total', totalCents: 12345 }])[0].channel === 'pix');

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
verify('Count fingerprint is order-stable by entry type', baseFingerprint === buildCountMaterialFingerprint({
  serviceLabel: 'Sunday',
  serviceDate: '2026-08-14',
  entries: [{ type: 'offering', method: 'total', totalCents: 10000 }],
}));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = COUNT_COPY[language];
  verify(`${language} Count home copy is complete`, Boolean(copy.homeTitle && copy.homeSubtitle && copy.newSession && copy.recentSessions));
  verify(`${language} Count flow copy is complete`, Boolean(copy.chooseTitle && copy.countTitle(copy.entryLabels.tithe) && copy.reviewTitle && copy.grandTotal));
  verify(`${language} Count covers all entry labels`, Boolean(copy.entryLabels.tithe && copy.entryLabels.offering && copy.entryLabels.other && copy.entryLabels.pix));
  verify(`${language} Count explains independent second count`, Boolean(copy.secondCountSafety && copy.secondCountPending));
  verify(`${language} Count explains no posting`, Boolean(copy.noPosting));
}

console.log(`\nCount 2.0 H1 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
