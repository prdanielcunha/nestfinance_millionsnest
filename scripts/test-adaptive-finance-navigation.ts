import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { buildFinanceNavigation } from '../src/lib/financeNavigationModel.js';

const full = {
  canView: true,
  canCreate: true,
  canReview: true,
  canManage: true,
};

async function run() {
  assert.deepStrictEqual(buildFinanceNavigation('ecosystem', full), {
    primary: ['finance', 'count', 'inbox', 'review'],
    more: ['transactions', 'balance', 'reports', 'audit', 'settings'],
  });

  assert.deepStrictEqual(buildFinanceNavigation('organization_admin', full), {
    primary: ['finance', 'count', 'inbox', 'review'],
    more: ['transactions', 'balance', 'reports', 'audit', 'settings'],
  });

  assert.deepStrictEqual(
    buildFinanceNavigation('review', {
      canView: true,
      canCreate: false,
      canReview: true,
      canManage: false,
    }),
    {
      primary: ['finance', 'review', 'inbox', 'transactions'],
      more: ['balance', 'reports', 'audit'],
    },
  );

  assert.deepStrictEqual(
    buildFinanceNavigation('operation', {
      canView: true,
      canCreate: true,
      canReview: false,
      canManage: false,
    }),
    {
      primary: ['finance', 'transactions', 'inbox', 'count'],
      more: [],
    },
  );

  assert.deepStrictEqual(
    buildFinanceNavigation('read_only', {
      canView: true,
      canCreate: false,
      canReview: false,
      canManage: false,
    }),
    {
      primary: ['finance', 'transactions', 'balance', 'reports'],
      more: ['audit'],
    },
  );

  assert.deepStrictEqual(
    buildFinanceNavigation('read_only', {
      canView: false,
      canCreate: false,
      canReview: false,
      canManage: false,
    }),
    {
      primary: ['finance'],
      more: [],
    },
  );

  const root = process.cwd();
  const shell = await fs.readFile(path.join(root, 'src/app/layouts/ShellLayout.tsx'), 'utf8');
  const more = await fs.readFile(path.join(root, 'src/pages/finance/MorePage.tsx'), 'utf8');
  const language = await fs.readFile(path.join(root, 'src/contexts/LanguageContext.tsx'), 'utf8');

  assert.ok(shell.includes("id: 'transactions'"));
  assert.ok(shell.includes("id: 'review'"));
  assert.ok(shell.includes('buildFinanceNavigation(experienceMode'));
  assert.ok(shell.includes('moreNavigation.length > 0'));
  assert.ok(shell.includes('primaryNavigation.map'));

  assert.ok(more.includes('buildFinanceNavigation(experienceMode'));
  assert.ok(more.includes('navigation.more.includes(item.id'));

  assert.ok(language.includes("nav_movimentacoes: { PT: 'Entradas e saídas'"));
  assert.ok(language.includes("nav_revisar: { PT: 'Conferir'"));
  assert.ok(language.includes("nav_cultos: { PT: 'Contagem'"));
  assert.ok(language.includes("nav_conferir: { PT: 'Conferir com o banco'"));
  assert.ok(language.includes("nav_capturas: { PT: 'Comprovantes'"));
  assert.ok(language.includes("nav_audit: { PT: 'Histórico'"));

  console.log('✅ Adaptive finance navigation keeps each role focused on relevant work');
}

run().catch((error) => {
  console.error('❌ Adaptive finance navigation quality failed', error);
  process.exit(1);
});
