import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getFinanceExperienceMode,
  getFinanceInterfaceRole,
} from '../src/lib/financeExperience.js';
import type { EcosystemAccessState } from '../src/types/access.js';

function granted(overrides: Partial<EcosystemAccessState> = {}): EcosystemAccessState {
  return {
    status: 'granted',
    organizationId: 'org_cycle_02',
    accessSource: 'organization_membership',
    isGlobalAccess: false,
    capabilities: [],
    ...overrides,
  };
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const clean = hex.replace('#', '');
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

function cssHex(source: string, token: string) {
  const match = source.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `Missing CSS token --${token}`);
  return match[1];
}

async function run() {
  const root = process.cwd();
  const read = (file: string) => fs.readFile(path.join(root, file), 'utf8');

  const [
    css,
    shell,
    button,
    flowStep,
    flowFeedback,
    flowHelp,
    flowConfirmation,
    countPage,
    countSession,
    today,
    roleWorkspace,
    languageContext,
    indexHtml,
  ] = await Promise.all([
    read('src/index.css'),
    read('src/app/layouts/ShellLayout.tsx'),
    read('src/components/foundation/Button.tsx'),
    read('src/components/foundation/FlowStepHeader.tsx'),
    read('src/components/foundation/FlowFeedback.tsx'),
    read('src/components/foundation/FlowHelp.tsx'),
    read('src/components/foundation/FlowConfirmation.tsx'),
    read('src/pages/finance/CountPage.tsx'),
    read('src/pages/finance/count/CountSessionPage.tsx'),
    read('src/pages/finance/TodayActionCenter.tsx'),
    read('src/components/finance/RoleWorkspacePanel.tsx'),
    read('src/contexts/LanguageContext.tsx'),
    read('index.html'),
  ]);

  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('min-width: 320px'));
  assert.ok(css.includes('.nf-operational'));
  assert.ok(css.includes('.nf-helper-text'));
  assert.ok(css.includes('.nf-skip-link'));

  const elevated = cssHex(css, 'nf-surface-elevated');
  const muted = cssHex(css, 'nf-text-muted');
  const secondary = cssHex(css, 'nf-text-secondary');
  assert.ok(
    contrast(muted, elevated) >= 4.5,
    `Muted text contrast must be WCAG AA on elevated surfaces; got ${contrast(muted, elevated).toFixed(2)}`,
  );
  assert.ok(
    contrast(secondary, elevated) >= 4.5,
    `Secondary text contrast must be WCAG AA on elevated surfaces; got ${contrast(secondary, elevated).toFixed(2)}`,
  );

  assert.ok(button.includes("md: 'min-h-[3.25rem]"));
  assert.ok(button.includes("lg: 'min-h-14"));

  assert.ok(shell.includes('href="#nestfinance-main-content"'));
  assert.ok(shell.includes('id="nestfinance-main-content"'));
  assert.ok(shell.includes('tabIndex={-1}'));
  assert.ok(shell.includes('nf-operational'));
  assert.ok(shell.includes('getFinanceInterfaceRole(accessState)'));
  assert.ok(!shell.includes('text-[10px]'));
  assert.ok(!shell.includes('text-[11px]'));

  for (const source of [countPage, countSession, today, roleWorkspace]) {
    assert.ok(!source.includes('text-[10px]'), 'Operational source contains 10px text');
    assert.ok(!source.includes('text-[11px]'), 'Operational source contains 11px text');
  }

  assert.ok(flowStep.includes('stepLabel: string'));
  assert.ok(flowFeedback.includes("aria-live={assertive ? 'assertive' : 'polite'}"));
  assert.ok(flowFeedback.includes('aria-atomic="true"'));
  assert.ok(flowHelp.includes('aria-expanded={open}'));
  assert.ok(flowHelp.includes('aria-controls={contentId}'));
  assert.ok(flowConfirmation.includes('const titleId = useId()'));

  assert.ok(countSession.includes('FlowStepHeader'));
  assert.ok(countSession.includes('FlowFeedback'));
  assert.ok(countSession.includes('FlowConfirmation'));
  assert.ok(countPage.includes('FlowHelp'));

  assert.ok(languageContext.includes("PT: 'Conferir com o banco'"));
  assert.ok(languageContext.includes("PT: 'Comprovantes'"));
  assert.ok(languageContext.includes("PT: 'Entradas e saídas'"));

  assert.ok(!indexHtml.includes('user-scalable=no'));
  assert.ok(!indexHtml.includes('maximum-scale=1'));

  assert.strictEqual(
    getFinanceInterfaceRole(granted({ capabilities: ['finance.create_drafts'] })),
    'volunteer',
  );
  assert.strictEqual(
    getFinanceInterfaceRole(granted({ capabilities: ['finance.review'] })),
    'treasurer',
  );
  assert.strictEqual(
    getFinanceInterfaceRole(granted({ organizationRole: 'admin' })),
    'administrator',
  );
  assert.strictEqual(
    getFinanceInterfaceRole(granted({ organizationRole: 'accountant', capabilities: ['finance.view'] })),
    'accountant',
  );
  assert.strictEqual(
    getFinanceExperienceMode(granted({ capabilities: ['finance.create_drafts'] })),
    'operation',
  );

  assert.ok(countPage.includes('sm:'));
  assert.ok(countPage.includes('lg:'));
  assert.ok(countSession.includes('sm:'));
  assert.ok(countSession.includes('lg:'));
  assert.ok(shell.includes('md:'));

  console.log('✅ Roadmap Cycle 02 accessibility and simplicity gate passed');
}

run().catch((error) => {
  console.error('❌ Roadmap Cycle 02 accessibility and simplicity gate failed', error);
  process.exit(1);
});
