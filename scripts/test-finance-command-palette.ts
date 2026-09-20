import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  filterFinancePaletteCommands,
  moveFinancePaletteSelection,
} from '../src/lib/financeCommandPaletteModel.js';

const commands = [
  { id: 'today', label: 'Hoje', route: '/finance', kind: 'navigation' as const },
  { id: 'reconciliation', label: 'Conciliação', route: '/finance/balance', kind: 'navigation' as const },
  { id: 'receipt', label: 'Capturar comprovante', route: '/finance/capture', kind: 'action' as const },
];

async function run() {
  assert.deepStrictEqual(
    filterFinancePaletteCommands(commands, 'conciliacao').map((command) => command.id),
    ['reconciliation'],
  );
  assert.deepStrictEqual(
    filterFinancePaletteCommands(commands, 'comprovante').map((command) => command.id),
    ['receipt'],
  );
  assert.strictEqual(moveFinancePaletteSelection(0, 3, -1), 2);
  assert.strictEqual(moveFinancePaletteSelection(2, 3, 1), 0);
  assert.strictEqual(moveFinancePaletteSelection(-1, 3, 1), 0);
  assert.strictEqual(moveFinancePaletteSelection(0, 0, 1), -1);

  const root = process.cwd();
  const shell = await fs.readFile(path.join(root, 'src/app/layouts/ShellLayout.tsx'), 'utf8');
  const palette = await fs.readFile(
    path.join(root, 'src/components/finance/FinanceCommandPalette.tsx'),
    'utf8',
  );

  assert.ok(shell.includes('FinanceCommandPalette'));
  assert.ok(shell.includes("(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'"));
  assert.ok(shell.includes("kind: 'action' as const"));
  assert.ok(shell.includes('canCreate ? ['));
  assert.ok(shell.includes('commandPaletteOpen'));

  assert.ok(palette.includes('role="dialog"'));
  assert.ok(palette.includes('role="combobox"'));
  assert.ok(palette.includes('role="listbox"'));
  assert.ok(palette.includes("event.key === 'ArrowDown'"));
  assert.ok(palette.includes("event.key === 'ArrowUp'"));
  assert.ok(palette.includes("event.key === 'Enter'"));
  assert.ok(palette.includes("event.key === 'Escape'"));

  for (const marker of [
    "commandTitle: 'Ir para ou agir'",
    "commandTitle: 'Go to or act'",
    "commandTitle: 'Ir o actuar'",
  ]) {
    assert.ok(shell.includes(marker), marker);
  }

  console.log('✅ Finance command palette keeps keyboard navigation and mutation actions capability-safe');
}

run().catch((error) => {
  console.error('❌ Finance command palette quality failed', error);
  process.exit(1);
});
