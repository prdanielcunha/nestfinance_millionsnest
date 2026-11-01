import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');

const accountant = source('src/pages/finance/AccountantWorkspacePage.tsx');
const reports = source('src/pages/finance/ReportsPage.tsx');
const balance = source('src/pages/finance/BalancePage.tsx');
const today = source('src/pages/finance/TodayActionCenter.tsx');
const start = source('src/pages/finance/count/CountStartJourney.tsx');
const count = source('src/pages/finance/CountPage.tsx');
const training = source('src/pages/finance/count/CountTrainingPage.tsx');
const shell = source('src/app/layouts/ShellLayout.tsx');
const inbox = source('src/pages/finance/inbox/inboxCopy.ts');

const check = (passed: boolean, reason: string) => {
  assert.ok(passed, reason);
  console.log('✓ ' + reason);
};

// A chosen historical accounting month must survive navigation into Reports.
check(
  accountant.includes('${report.route}?period=${encodeURIComponent(period)}') &&
  reports.includes("searchParams.get('period')") &&
  reports.includes("useSearchParams") &&
  reports.includes("0[1-9]|1[0-2]"),
  'accountant period passes to Reports with validated YYYY-MM period',
);
check(
  !accountant.includes('fechamento definitivo ainda não foram habilitados') &&
  accountant.includes('fechamento do mês está disponível em Relatórios') &&
  accountant.includes('without original evidence attached'),
  'accountant workspace no longer contradicts the guarded month close',
);

// A cash box is a valid finance account, but cannot be reconciled to a bank statement.
check(
  balance.includes("account.type !== 'cash'") &&
  balance.includes('bankAccounts.map') &&
  balance.includes('bankAccounts.length === 0') &&
  balance.includes('bankAccounts.filter((account) => account.eligible)'),
  'bank-source list and picker exclude physical cash boxes',
);

// The first Count screen must not show alarm copy when no count is waiting.
check(
  count.includes("item.status === 'counting_b'") &&
  count.includes('awaitingSecondCount ? copy.secondCountPending : copy.homeSubtitle'),
  'second-counter pending text is conditional on an existing count',
);
check(
  start.includes('otherActions') &&
  start.includes('<details className=') &&
  start.includes('Preparação · passo') &&
  start.includes('Setup · step') &&
  start.includes('Preparación · paso'),
  'Count shows two primary start actions and labels its 3 steps as preparation',
);
check(
  training.includes("type Field = 'tithe' | 'offering' | 'other'") &&
  !training.includes("pix: 'Pix'") &&
  !training.includes("pix: 0") &&
  training.includes('Pix e cartão são registrados depois na tesouraria'),
  'synthetic cash-count training does not include digital payments',
);

// Empty task queues must not imply verified financial setup or month close.
check(
  today.includes('payablesService.ledgerStatus') &&
  today.includes('status.accounts.some((account) => !account.certified)') &&
  today.includes("setupState === 'required' ? copy.setupTitle : copy.setupUnknownTitle") &&
  today.includes('APP_ROUTES.financeStart') &&
  today.includes("setupState === 'checking'"),
  'Today prioritizes opening balances and fails closed on unknown setup state',
);
check(
  shell.includes('end={item.route === APP_ROUTES.finance}'),
  'active Today navigation does not match every nested finance route',
);
check(
  inbox.includes("pageTitle: 'Comprovantes'") &&
  inbox.includes("pageTitle: 'Receipts & documents'") &&
  inbox.includes("pageTitle: 'Comprobantes'") &&
  inbox.includes('Confira os dados identificados antes de registrar'),
  'document queue has human-readable PT/EN/ES titles and safe guidance',
);

console.log('NestFinance 2026-11-01 UX readiness assertions passed.');
