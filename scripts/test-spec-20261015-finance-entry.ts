import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getFinanceEntryProfile } from '../src/lib/financeEntryProfile.js';
import type { EcosystemAccessState } from '../src/types/access.js';

function state(roles: string[], capabilities: string[]): EcosystemAccessState {
  return { status: 'granted', organizationRole: 'member', roles, capabilities, organizationId: 'synthetic_org' };
}
const minimum = ['finance.view', 'finance.create_drafts'];
const countOnly = getFinanceEntryProfile(state(['count_team'], minimum));
assert.equal(countOnly.countOnly, true);
assert.equal(countOnly.canCount, true);
assert.equal(countOnly.canFinance, false);
assert.equal(countOnly.canAccountant, false);

const volunteer = getFinanceEntryProfile(state(['voluntário'], minimum));
assert.equal(volunteer.countOnly, true);
const treasury = getFinanceEntryProfile(state(['tesoureiro'], [...minimum, 'finance.review']));
assert.equal(treasury.canCount, true);
assert.equal(treasury.canFinance, true);
assert.equal(treasury.canAccountant, true);
assert.equal(treasury.countOnly, false);
const both = getFinanceEntryProfile(state(['conferente', 'financeiro'], minimum));
assert.equal(both.canCount && both.canFinance, true);
const accounting = getFinanceEntryProfile(state(['contador'], ['finance.view']));
assert.equal(accounting.accountantOnly, true);
assert.equal(accounting.canCount, false);
assert.equal(accounting.canFinance, false);
const admin = getFinanceEntryProfile({ ...state([], []), organizationRole: 'admin' });
assert.equal(admin.canCount && admin.canFinance && admin.canAccountant, true);
assert.deepEqual(getFinanceEntryProfile(null).canCount, false);
const implicit = getFinanceEntryProfile(state([], minimum));
assert.equal(implicit.canFinance, true, 'Ambiguous but authorized finance drafting must remain accessible');
assert.equal(implicit.roleBasis, 'capability_fallback');

const root = readFileSync('src/pages/finance/FinancePage.tsx', 'utf8');
const choices = readFileSync('src/pages/finance/FinanceEntryChoices.tsx', 'utf8');
const countStart = readFileSync('src/pages/finance/count/CountStartJourney.tsx', 'utf8');
const countJoin = readFileSync('src/pages/finance/count/CountJoinPage.tsx', 'utf8');
const copy = readFileSync('src/pages/finance/count/countCopy.ts', 'utf8');
const routing = readFileSync('src/app/router/index.tsx', 'utf8');
assert.ok(root.includes('<TodayActionCenter />'), 'Actual Today screen must be mounted at real entry route');
assert.ok(root.includes('entryProfile.countOnly') && root.includes('APP_ROUTES.count'), 'Count-only role opens Count directly');
assert.ok(root.includes('entryProfile.accountantOnly') && root.includes('APP_ROUTES.accountant'), 'Accountant role opens accountant area');
assert.ok(root.includes('<FinanceEntryChoices'), 'Users with multiple roles see both paths');
assert.ok(root.includes("searchParams.has('classic')"), 'Existing dashboard preserved during migration');
assert.ok(choices.includes('Contar dízimos e ofertas'));
assert.ok(choices.includes('Cuidar do financeiro'));
assert.ok(choices.includes('Espaço do contador'));
assert.ok(choices.includes('Registrar entrada') && choices.includes('Registrar despesa'));
assert.ok(choices.includes('profile.canCount') && choices.includes('profile.canFinance'));
assert.ok(countStart.includes('Entrar como segundo conferente'));
assert.ok(countJoin.includes('segundo conferente'));
assert.ok(copy.includes("countA: 'Primeiro conferente'"));
assert.ok(copy.includes("countB: 'Segundo conferente'"));
assert.ok(routing.includes('FinanceCapabilityBoundary'), 'Canonical route authority is preserved');
console.log('✅ Count team vs treasury vs accountant entry and terminology tests passed');
