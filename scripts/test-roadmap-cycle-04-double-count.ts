import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareCountEntries } from '../shared/finance/count.js';

const read = (path: string) => readFileSync(path, 'utf8');

const domain = read('shared/finance/count.ts');
const createSession = read('server/vercel-handlers/finance/countSessionsCreate.ts');
const startSecond = read('server/vercel-handlers/finance/countSessionsStartSecondCount.ts');
const joinSecond = read('server/vercel-handlers/finance/countSessionsJoinSecondCount.ts');
const refreshInvite = read('server/vercel-handlers/finance/countSessionsRefreshSecondInvite.ts');
const submitSecond = read('server/vercel-handlers/finance/countSessionsSubmitSecondCount.ts');
const detail = read('server/vercel-handlers/finance/countSessionsDetail.ts');
const captureApply = read('server/vercel-handlers/finance/countCapturesApplyToCount.ts');
const service = read('src/services/countService.ts');
const sessionPage = read('src/pages/finance/count/CountSessionPage.tsx');
const joinPage = read('src/pages/finance/count/CountJoinPage.tsx');
const gate = read('src/pages/finance/count/CountSecondCounterGate.tsx');
const panels = read('src/pages/finance/count/CountH2Panels.tsx');
const startJourney = read('src/pages/finance/count/CountStartJourney.tsx');
const routes = read('src/app/router/routes.ts');
const router = read('src/app/router/index.tsx');
const gateway = read('api/finance-gateway.ts');

const comparison = compareCountEntries(
  [
    {
      type: 'tithe',
      method: 'denominations',
      denominations: { '10000': 2, '5000': 1 },
    },
    { type: 'offering', method: 'total', totalCents: 10000 },
  ],
  [
    {
      type: 'tithe',
      method: 'denominations',
      denominations: { '10000': 1, '5000': 2 },
    },
    { type: 'offering', method: 'denominations', denominations: { '5000': 1 } },
  ],
);

assert.equal(comparison.matched, false);
assert.equal(comparison.totalDeltaCents, -5000);
const titheDifference = comparison.differences.find((item) => item.type === 'tithe');
assert.ok(titheDifference);
assert.equal(titheDifference?.countAMethod, 'denominations');
assert.equal(titheDifference?.countBMethod, 'denominations');
assert.ok(titheDifference?.denominationDifferences.some(
  (item) => item.denominationCents === 10000 && item.deltaQuantity === -1,
));
assert.ok(titheDifference?.denominationDifferences.some(
  (item) => item.denominationCents === 5000 && item.deltaQuantity === 1,
));
const offeringDifference = comparison.differences.find((item) => item.type === 'offering');
assert.equal(offeringDifference?.countAMethod, 'total');
assert.equal(offeringDifference?.countBMethod, 'denominations');

assert.ok(domain.includes('CountDenominationDifference'));
assert.ok(domain.includes('denominationDifferences'));

assert.ok(createSession.includes('requireIndependentCounter: true'));
assert.ok(createSession.includes('safe_default_v2'));

assert.ok(startSecond.includes("randomBytes(10)"));
assert.ok(startSecond.includes("SECOND_COUNT_CODE_ALPHABET"));
assert.ok(startSecond.includes("createHash('sha256')"));
assert.ok(startSecond.includes("countSecondInvites"));
assert.ok(startSecond.includes("secondCountInviteRequired: true"));
assert.ok(startSecond.includes("secondCountInviteExpiresAt"));
assert.ok(startSecond.includes("joinCode"));

assert.ok(joinSecond.includes('COUNT_INDEPENDENT_COUNTER_REQUIRED'));
assert.ok(joinSecond.includes('session.countA?.countedByUid || session.countA?.enteredByUid'));
assert.ok(joinSecond.includes('session.secondCountAssignedToUid'));
assert.ok(joinSecond.includes('COUNT_JOIN_CODE_EXPIRED'));
assert.ok(joinSecond.includes("action: 'count.second_counter_joined'"));
assert.ok(joinSecond.includes('blindMaterial: true'));
assert.ok(!joinSecond.includes('session.countA.entries'));

assert.ok(refreshInvite.includes('transaction.delete(previousInviteRef)'));
assert.ok(refreshInvite.includes('COUNT_INVITE_REFRESH_FORBIDDEN'));
assert.ok(refreshInvite.includes('COUNT_SECOND_COUNTER_ALREADY_ASSIGNED'));
assert.ok(refreshInvite.includes("action: 'count.second_invite_refreshed'"));

assert.ok(submitSecond.includes('COUNT_INDEPENDENT_COUNTER_REQUIRED'));
assert.ok(submitSecond.includes('COUNT_SECOND_COUNTER_NOT_ASSIGNED'));
assert.ok(submitSecond.includes('session.secondCountAssignedToUid !== uid'));
assert.ok(submitSecond.includes('countedByLabel: actorLabel'));

assert.ok(captureApply.includes('COUNT_INDEPENDENT_COUNTER_REQUIRED'));
assert.ok(captureApply.includes('COUNT_SECOND_COUNTER_NOT_ASSIGNED'));
assert.ok(captureApply.includes('session.secondCountAssignedToUid !== uid'));
assert.ok(captureApply.includes('enteredByLabel: actorLabel'));

assert.ok(detail.includes("data.status === 'counting_b' || data.status === 'recounting'"));
assert.ok(detail.includes('session.countA = null'));
assert.ok(detail.includes('session.countB = null'));
assert.ok(detail.includes('session.comparison = null'));
assert.ok(detail.includes('session.recountAttempts = []'));
assert.ok(detail.includes('currentUserIsFirstCounter'));
assert.ok(detail.includes('currentUserIsSecondCounter'));
assert.ok(detail.includes("data.status === 'counting_b' && data.secondCountStartedByUid === uid"));

assert.ok(service.includes('joinSecondCount'));
assert.ok(service.includes('refreshSecondInvite'));
assert.ok(service.includes("'count-sessions-join-second-count'"));
assert.ok(service.includes("'count-sessions-refresh-second-invite'"));

assert.ok(routes.includes("countJoin: '/finance/count/join'"));
assert.ok(router.includes('<CountJoinPage />'));
assert.ok(startJourney.includes('APP_ROUTES.countJoin'));
assert.ok(joinPage.includes('countService.joinSecondCount'));
assert.ok(joinPage.includes('Os valores dela continuam totalmente ocultos'));
assert.ok(gate.includes('countService.refreshSecondInvite'));
assert.ok(gate.includes('Gerar novo código'));
assert.ok(gate.includes('navigator.share'));

assert.ok(sessionPage.includes('session.currentUserIsSecondCounter === true'));
assert.ok(sessionPage.includes('<CountSecondCounterGate'));
assert.ok(sessionPage.indexOf('<CountSecondCounterGate') < sessionPage.indexOf('<CountBlindWorkspace'));

assert.ok(panels.includes('denominationDifferences'));
assert.ok(panels.includes('sourceCaptureId'));
assert.ok(panels.includes("correct: 'Correto'"));
assert.ok(panels.includes("recount: 'Contar novamente'"));
assert.ok(panels.includes("help: 'Pedir ajuda'"));
assert.ok(panels.includes('countedByLabel'));
assert.ok(panels.includes('formatAuditTimestamp'));
assert.ok(!panels.includes('text-[11px]'));

assert.ok(gateway.includes('count-sessions-join-second-count'));
assert.ok(gateway.includes('count-sessions-refresh-second-invite'));

for (const source of [joinPage, gate, panels, joinSecond, refreshInvite, submitSecond]) {
  assert.ok(!source.includes('approve-for-posting'));
  assert.ok(!source.includes('posting-plan'));
  assert.ok(!source.includes('financeJournalEntries'));
}

console.log('✅ Roadmap Cycle 04 independent double-count gate passed');
