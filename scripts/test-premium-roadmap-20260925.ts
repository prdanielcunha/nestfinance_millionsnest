import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';

async function read(relativePath: string) {
  return fs.readFile(path.join(process.cwd(), relativePath), 'utf8');
}

async function run() {
  const [
    shell,
    today,
    ecosystem,
    countPage,
    countJourney,
    entityContext,
    entitySelection,
    palette,
    transactions,
    review,
    reports,
    more,
    transactionCreate,
    transactionEditGuided,
    router,
  ] = await Promise.all([
    read('src/app/layouts/ShellLayout.tsx'),
    read('src/pages/finance/TodayActionCenter.tsx'),
    read('src/components/finance/EcosystemOverviewPanel.tsx'),
    read('src/pages/finance/CountPage.tsx'),
    read('src/pages/finance/count/CountStartJourney.tsx'),
    read('src/components/finance/FinanceEntityContextBar.tsx'),
    read('src/components/finance/FinanceEntitySelectionState.tsx'),
    read('src/components/finance/FinanceCommandPalette.tsx'),
    read('src/pages/finance/transactions/TransactionsListPage.tsx'),
    read('src/pages/finance/transactions/ReviewPage.tsx'),
    read('src/pages/finance/ReportsPage.tsx'),
    read('src/pages/finance/MorePage.tsx'),
    read('src/pages/finance/transactions/TransactionCreatePage.tsx'),
    read('src/pages/finance/transactions/TransactionEditGuidedPage.tsx'),
    read('src/app/router/index.tsx'),
  ]);

  // P0 — count is a first-class, capability-safe action everywhere.
  assert.ok(shell.includes("id: 'action:count'"), 'Command palette must expose Count');
  assert.ok(shell.includes("startCount: 'Iniciar contagem'"), 'PT Count action is missing');
  assert.ok(shell.includes("startCount: 'Start count'"), 'EN Count action is missing');
  assert.ok(shell.includes("startCount: 'Iniciar conteo'"), 'ES Count action is missing');
  assert.ok(shell.includes("continueCount: 'Continuar contagem'"), 'Open Count must be resumable');
  assert.ok(shell.includes("const canCount = canViewFinance && canCreate"), 'Count shortcut must require view + create');
  assert.ok(shell.includes("primaryFabActions = orderedFabActions.slice(0, 4)"), 'Mobile action sheet must cap primary actions');
  assert.ok(shell.includes("copy.seeAllActions"), 'Overflow actions must remain discoverable');
  assert.ok(shell.includes('role="dialog"'), 'Mobile action sheet must expose dialog semantics');
  assert.ok(shell.includes("fabMenuRef.current?.querySelector<HTMLElement>('button')?.focus()"), 'FAB must move focus into the sheet');
  assert.ok(shell.includes("requestAnimationFrame(() => fabButtonRef.current?.focus())"), 'FAB must restore focus on close');
  assert.ok(shell.includes("returnTo.startsWith('/finance/')"), 'Entity selection must restore the original finance intent');

  // Opening the menu or route never creates a Count session.
  assert.ok(!shell.includes('countService.create('), 'Shell must never create a Count session');
  assert.ok(countJourney.includes("onStart({"), 'Count creation remains behind the guided journey');
  assert.ok(countPage.includes("canCreate && !loading && !error"), 'Count start must be blocked while session state is unknown');
  assert.ok(countJourney.includes('onResume?.(resumable)'), 'Resume intent should be explicit');

  // Today is action-first and Count-aware.
  assert.ok(today.includes("const activeCount = countItems.find"), 'Today must detect resumable Count');
  assert.ok(today.includes('countActionRoute'), 'Today Count CTA must resolve a safe route');
  assert.ok(today.includes('COUNT_PRIMARY_COPY[language].resumeAction'), 'Today must say Continue Count when relevant');
  assert.ok(today.includes("sm:grid-cols-2 lg:grid-cols-4"), 'Today metric groups should use compact responsive hierarchy');

  // CEO ecosystem view is attention-first and transparent about freshness.
  assert.ok(ecosystem.includes("attention: 0"), 'Attention organizations must sort first');
  assert.ok(ecosystem.includes("setLastUpdatedAt"), 'Ecosystem view must expose freshness');
  assert.ok(ecosystem.includes("nextOverview.generatedAt"), 'Freshness must use the server snapshot timestamp');
  assert.ok(ecosystem.includes("{overview ? ("), 'A last known ecosystem snapshot should survive refresh failure');
  assert.ok(ecosystem.includes("copy.allClear"), 'Empty attention state must be summarized instead of showing five equal zero cards');

  // Mobile context keeps full organization/entity names out of the cramped top bar.
  assert.ok(shell.includes('layout="symbol"'), 'Mobile header should use the compact brand symbol');
  assert.ok(shell.includes('setMobileContextOpen(true)'), 'Mobile context needs an explicit full-name sheet');
  assert.ok(shell.includes('copy.contextTitle'), 'Mobile context sheet must be labeled');

  // P1 — explanatory choices and instrumentation.
  assert.ok(transactionCreate.includes('<FinanceSelect'), 'Transaction choices must use FinanceSelect');
  assert.ok(transactionEditGuided.includes('<FinanceSelect'), 'Guided edit choices must use FinanceSelect');
  assert.ok(transactionCreate.includes('getTransactionOptionGuidance(language)'), 'Transaction choices need contextual guidance');
  assert.ok(transactionCreate.includes("flow: 'transaction_create_draft'"), 'Draft journey must be measured');
  assert.ok(transactionCreate.includes("flow: 'transaction_submit_review'"), 'Submit-to-review journey must be measured');
  assert.ok(countPage.includes("flow: `count_start_${input.mode}`"), 'Count method journeys must be measured');
  assert.ok(countPage.includes("flow: 'count_resume'"), 'Count resume intent must be measured');

  // P2 — no sub-12px operational labels in the touched workspaces.
  for (const [name, source] of [
    ['Shell', shell],
    ['Today', today],
    ['Ecosystem', ecosystem],
    ['Entity context', entityContext],
    ['Entity selection', entitySelection],
    ['Command palette', palette],
    ['Transactions', transactions],
    ['Review', review],
    ['More', more],
  ] as const) {
    assert.ok(!source.includes('text-[10px]'), `${name} still contains 10px operational text`);
    assert.ok(!source.includes('text-[11px]'), `${name} still contains 11px operational text`);
  }

  assert.ok(more.includes('NAV_DESCRIPTIONS'), 'More should explain what each professional area is for');
  assert.ok(more.includes('divide-y divide-border-subtle'), 'More should use grouped rows instead of repeated bordered cards');
  assert.ok(
    !reports.includes('rounded-2xl border border-border-subtle bg-surface-elevated p-4'),
    'Reports should not repeat the old nested neutral-card treatment',
  );

  // Current routes keep the premium guided editor as the primary edit experience.
  assert.ok(
    router.includes("const TransactionEditGuidedPage") &&
      router.includes("path: APP_ROUTES.transactionEdit") &&
      router.includes("<TransactionEditGuidedPage />"),
    'Primary transaction edit route must remain on the guided editor',
  );

  console.log('✅ Premium UX roadmap 2026-09-25 engineering gate passed');
}

run().catch((error) => {
  console.error('❌ Premium UX roadmap 2026-09-25 engineering gate failed', error);
  process.exit(1);
});
