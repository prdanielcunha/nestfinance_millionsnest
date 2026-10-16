import { getFirestoreDb } from '../api/_lib/firebaseAdmin.js';
import { runIndependentFinanceRecovery } from './vercel-handlers/finance/independentConnectPendingRecovery.js';
try {
  const result = await runIndependentFinanceRecovery({
    enabled: process.env.NESTFINANCE_CONNECT_PENDING_EVENTS_ENABLED === 'true',
    signingSecret: process.env.NESTFINANCE_CONNECT_SOURCE_EVENT_SECRET,
    operatorTargetsJson: process.env.NESTFINANCE_CONNECT_OPERATOR_TARGETS_JSON,
    db: getFirestoreDb,
  });
  console.info(JSON.stringify({ event: 'connect_source_recovery', source: 'nestfinance', ...result }));
  if (result.failures) process.exitCode = 1;
} catch {
  console.error('FINANCE_CONNECT_RECOVERY_CONFIGURATION_OR_RUNTIME_FAILED');
  process.exitCode = 1;
}
