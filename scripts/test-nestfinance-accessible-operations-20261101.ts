import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (path: string) => readFileSync(path, 'utf8');
const select = load('src/components/finance/FinanceSelect.tsx');
const create = load('src/pages/finance/transactions/TransactionCreatePage.tsx');
const list = load('src/pages/finance/transactions/TransactionsListPage.tsx');
const quickText = load('src/pages/finance/capture/UniversalQuickTextEntry.tsx');

const verify = (value: unknown, label: string) => {
  assert.ok(value, label);
  console.log('✓ ' + label);
};

verify(select.includes('label?: string;') &&
  select.includes('aria-label={label || placeholder}') &&
  select.includes('role="combobox"'),
  'custom finance selector exposes a field name independent of placeholder');

for (const name of ['copy.category', 'copy.fund', 'copy.costCenter', 'copy.settlementType', 'copy.liabilityAccount', 'copy.destinationAccount']) {
  verify(create.includes(name), `transaction creation preserves an accessible ${name} label`);
}
verify(create.includes('label={`${copy.category} ${index + 1}`}') &&
  create.includes('aria-label={`${copy.costCenter} ${index + 1}`}') &&
  create.includes('aria-label={`${copy.allocationAmount} ${index + 1}`}'),
  'multiple allocations have unique, readable field names');
verify(create.includes("useState(initialDirection === 'income' || initialDirection === 'expense')") &&
  create.includes("setShowClassification(nextDirection === 'income' || nextDirection === 'expense')"),
  'required category is visible from the start of income and expense flows');
verify(create.includes('today.getFullYear()') &&
  create.includes('today.getMonth() + 1') &&
  !create.includes("new Date().toISOString().split('T')[0]"),
  'receipt/payment default date uses local calendar rather than UTC');

verify(list.includes('getFinanceInterfaceRole(accessState)') &&
  list.includes("interfaceRole === 'accountant'") &&
  list.includes("interfaceRole === 'treasurer'") &&
  list.includes("interfaceRole === 'administrator'") &&
  list.includes('professionalTools ? (') &&
  list.includes('<TransactionSavedViews') &&
  list.includes("professionalTools ? 'hidden lg:block' : 'hidden'"),
  'saved views and desktop advanced filters remain available to professional roles');
verify(list.includes("professionalTools ? 'lg:hidden' : ''") &&
  list.includes("professionalTools ? 'lg:hidden' : ''"),
  'operational profiles can still open filters on desktop or mobile');

verify(quickText.includes('htmlFor="universal-quick-text"') &&
  quickText.includes('id="universal-quick-text"') &&
  quickText.includes('entryLabel:') &&
  quickText.includes("Descreva o que aconteceu") &&
  quickText.includes('Describe what happened') &&
  quickText.includes('Describe lo que pasó'),
  'universal text capture exposes a visible accessible field label in PT/EN/ES');

console.log('NestFinance 2026-11-01 accessible operational journey checks passed.');
