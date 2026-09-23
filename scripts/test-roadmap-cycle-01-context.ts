import * as fs from 'node:fs';
import * as path from 'node:path';
import { selectPreferredFinanceEntity } from '../src/contexts/financeEntitySelection';

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed += 1;
    return;
  }
  console.error(`❌ ${name}`);
  failed += 1;
}

const churchA = { id: 'church-a', displayName: 'Church A' };
const churchB = { id: 'church-b', displayName: 'Church B' };

verify('empty entity set stays unselected', selectPreferredFinanceEntity([], null, null) === undefined);
verify('one accessible entity is auto-selected', selectPreferredFinanceEntity([churchA], null, null)?.id === 'church-a');
verify('multiple entities require a choice without memory', selectPreferredFinanceEntity([churchA, churchB], null, null) === undefined);
verify('valid session selection wins', selectPreferredFinanceEntity([churchA, churchB], 'church-b', 'church-a')?.id === 'church-b');
verify('valid remembered selection is restored', selectPreferredFinanceEntity([churchA, churchB], null, 'church-b')?.id === 'church-b');
verify('stale remembered entity is ignored', selectPreferredFinanceEntity([churchA, churchB], null, 'church-x') === undefined);

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(relativePath), 'utf8');

const today = read('src/pages/finance/TodayActionCenter.tsx');
const selector = read('src/components/finance/FinanceEntitySelectionState.tsx');
const context = read('src/contexts/FinanceEntityContext.tsx');
const clientMetrics = read('src/services/financeJourneyMetricsService.ts');
const serverMetrics = read('server/vercel-handlers/finance/journeyMetricsRecord.ts');
const gateway = read('api/finance-gateway.ts');
const cloudrunRoutes = read('cloudrunRoutes.ts');
const vercel = read('vercel.json');

verify('Today delegates missing context to canonical selector', today.includes('<FinanceEntitySelectionState canManageFinance={canManageFinance} />'));
verify('Today no longer calls the management entity list', !today.includes('/api/finance/entities/list'));
verify('selector uses server-scoped accessible entities', selector.includes('accessibleFinanceEntities'));
verify('selector configures entities through the correct route', selector.includes('APP_ROUTES.financeSettingsEntities'));
verify('selector delays skeleton until 600ms', selector.includes('setTimeout(() => setShowSkeleton(true), 600)'));
verify('selector offers slow-load recovery after 4s', selector.includes('setTimeout(() => setShowSlowNotice(true), 4000)') && selector.includes('refreshAccessibleFinanceEntities'));
verify('selector exposes loading state to assistive technology', selector.includes('aria-live="polite"') && selector.includes('aria-busy="true"'));
verify('context preserves single-source accessible endpoint', context.includes('listAccessibleFinanceEntities'));
verify('context centralizes preferred entity selection', context.includes('selectPreferredFinanceEntity'));
verify('client metrics buffer locally before server flush', clientMetrics.includes('nestfinance_journey_metrics_v1') && clientMetrics.includes('1500'));
verify('metrics cover login, selection, start and completion', ['login', 'entity_selection', 'flow_start', 'flow_complete'].every((metric) => clientMetrics.includes(`'${metric}'`)));
verify('server metrics are organization-scoped aggregates', serverMetrics.includes("collection('organizations')") && serverMetrics.includes("collection('financeProductMetrics')"));
verify('server metrics do not persist uid as a field', !serverMetrics.includes('uid,') && !serverMetrics.includes('uid:'));
verify('gateway exposes metrics operation', gateway.includes("case 'journey-metrics-record'"));
verify('Cloud Run exposes metrics route', cloudrunRoutes.includes('"/api/finance/metrics/record"'));
verify('legacy rollback route stays in parity', vercel.includes('"/api/finance/metrics/record"'));

console.log(`\nCycle 01 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
