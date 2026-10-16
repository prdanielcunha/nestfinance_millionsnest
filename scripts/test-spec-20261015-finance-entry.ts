import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getFinanceEntryProfile } from '../src/lib/financeEntryProfile.js';
import { hasEffectiveCapability } from '../src/lib/permissions.js';
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

// "Treasurer" is a church title, not financial authority. The canonical Hub
// membership must be able to grant Count-only responsibility regardless of it.
const countOnlyTreasurerState = state(['tesoureiro'], [...minimum, 'finance.count.execute']);
const countOnlyTreasurer = getFinanceEntryProfile(countOnlyTreasurerState);
assert.equal(countOnlyTreasurer.canCount, true);
assert.equal(countOnlyTreasurer.canFinance, false);
assert.equal(countOnlyTreasurer.canAccountant, false);
assert.equal(countOnlyTreasurer.countOnly, true);
assert.equal(countOnlyTreasurer.roleBasis, 'explicit');
assert.equal(hasEffectiveCapability(countOnlyTreasurerState, 'finance.review'), false);
assert.equal(hasEffectiveCapability(countOnlyTreasurerState, 'finance.accounts.manage'), false);
assert.equal(hasEffectiveCapability(countOnlyTreasurerState, 'organization.manage_entities'), false);

const countOnlyTeamAdminState = { ...state(['administrador de equipe'], [...minimum, 'finance.count.execute', 'organization.manage_team']), organizationRole: 'admin' };
assert.equal(getFinanceEntryProfile(countOnlyTeamAdminState).countOnly, true);
assert.equal(hasEffectiveCapability(countOnlyTeamAdminState, 'finance.manage'), false);

const teamOnlyAdministratorState = {
  ...state(['administrador de equipe'], ['organization.manage_team']),
  organizationRole: 'admin',
};
const teamOnlyEntry = getFinanceEntryProfile(teamOnlyAdministratorState);
assert.equal(teamOnlyEntry.canFinance, false);
assert.equal(teamOnlyEntry.canCount, false);
assert.equal(teamOnlyEntry.canAccountant, false);
assert.equal(hasEffectiveCapability(teamOnlyAdministratorState, 'finance.view'), false);
assert.equal(hasEffectiveCapability(teamOnlyAdministratorState, 'finance.create_drafts'), false);

const secretaryFinanceState = state(['secretária'], [...minimum, 'finance.review']);
assert.equal(getFinanceEntryProfile(secretaryFinanceState).canFinance, true);
assert.equal(getFinanceEntryProfile(secretaryFinanceState).countOnly, false);

const dualResponsibility = getFinanceEntryProfile(state(['tesoureiro'], [...minimum, 'finance.count.execute', 'finance.review']));
assert.equal(dualResponsibility.canCount, true);
assert.equal(dualResponsibility.canFinance, true);
assert.equal(dualResponsibility.countOnly, false);

const volunteer = getFinanceEntryProfile(state(['voluntário'], minimum));
assert.equal(volunteer.countOnly, true);
const treasury = getFinanceEntryProfile(state(['tesoureiro'], [...minimum, 'finance.review']));
assert.equal(treasury.canCount, false, 'Treasury permission does not imply permission to operate Count');
assert.equal(treasury.canFinance, true);
assert.equal(treasury.canAccountant, false, 'Treasury review does not make someone the accountant');
assert.equal(treasury.financeOnly, true);
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
const shell = readFileSync('src/app/layouts/ShellLayout.tsx', 'utf8');
const accountantWorkspace = readFileSync('src/pages/finance/AccountantWorkspacePage.tsx', 'utf8');
const professionalLinks = readFileSync('src/pages/finance/MorePage.tsx', 'utf8');
const treasuryHub = readFileSync('src/pages/finance/TreasuryHubPage.tsx', 'utf8');
const proposal = readFileSync('src/pages/finance/count/CountProposalPage.tsx', 'utf8');
const roles = readFileSync('src/lib/financeExperience.ts', 'utf8');
const treasuryBoundary = readFileSync('src/app/boundaries/FinanceTreasuryAreaBoundary.tsx', 'utf8');
assert.ok(root.includes('<TodayActionCenter />'), 'Actual Today screen must be mounted at real entry route');
assert.ok(root.includes('entryProfile.countOnly') && root.includes('APP_ROUTES.count'), 'Count-only role opens Count directly');
assert.ok(root.includes('entryProfile.accountantOnly') && root.includes('APP_ROUTES.accountant'), 'Accountant role opens accountant area');
assert.ok(root.includes('entryProfile.financeOnly') && root.includes('APP_ROUTES.treasury'), 'Treasury-only role opens the financial workspace');
assert.ok(root.includes('<FinanceEntryChoices'), 'Users with multiple roles see both paths');
assert.ok(root.includes("searchParams.has('classic')"), 'Existing dashboard preserved during migration');
assert.ok(choices.includes('Contar dízimos e ofertas'));
assert.ok(choices.includes('Cuidar do financeiro'));
assert.ok(choices.includes('Espaço do contador'));
assert.ok(choices.includes('Registrar entrada') && choices.includes('Registrar despesa'));
assert.ok(choices.includes('profile.canCount') && choices.includes('profile.canFinance'));
assert.ok(choices.includes('navigate(APP_ROUTES.treasury)'), 'Finance entry goes to a complete finance hub');
assert.ok(routing.includes('path: APP_ROUTES.treasury, element: withTreasuryAccess('));
assert.ok(treasuryHub.includes('APP_ROUTES.financeReview') && treasuryHub.includes('APP_ROUTES.balance') && treasuryHub.includes('APP_ROUTES.reports'));
assert.ok(treasuryHub.includes('Registrar entrada') && treasuryHub.includes('Registrar despesa'));
assert.ok(treasuryHub.includes('Contagem já concluída?'));
assert.ok(treasuryHub.includes('onClick={() => navigate(APP_ROUTES.count)}') && treasuryHub.includes('onClick={() => navigate(APP_ROUTES.financeReview)}'), 'Verified counts must be discoverable before treasury review proposals are created');
assert.ok(!treasuryHub.includes('countService.saveFirstCount'), 'Treasury must not repeat submitted Count values');
assert.ok(countStart.includes('Entrar como segundo conferente'));
assert.ok(countJoin.includes('segundo conferente'));
assert.ok(copy.includes("countA: 'Primeiro conferente'"));
assert.ok(copy.includes("countB: 'Segundo conferente'"));
assert.ok(routing.includes('FinanceCapabilityBoundary'), 'Canonical route authority is preserved');
assert.ok(routing.includes('function withTreasuryAccess('));
assert.ok(routing.includes('path: APP_ROUTES.transactionCreate, element: withTreasuryAccess('));
assert.ok(routing.includes('path: APP_ROUTES.reports, element: withTreasuryAccess('));
assert.ok(routing.includes('path: APP_ROUTES.universalCapture, element: withTreasuryAccess('));
assert.ok(treasuryBoundary.includes('if (profile.countOnly)'));
assert.ok(treasuryBoundary.includes('Canonical roles must ALSO be enforced by API handlers.'), 'The UI boundary does not replace server authorization');
assert.ok(shell.includes('const canRegisterFinance = canCreate && entryProfile.canFinance;'));
assert.ok(shell.includes("entryProfile.countOnly || item.id === 'finance' || item.id === 'count'"));
assert.ok(shell.includes('const canCount = entryProfile.canCount;') && shell.includes('primaryNavigation.map'), 'Count availability is role-filtered in dynamic navigation');
assert.ok(accountantWorkspace.includes('if (!entryProfile.canAccountant)'));
assert.ok(professionalLinks.includes('entryProfile.canAccountant ?'));
assert.ok(proposal.includes("firstCounter: 'Primeiro conferente'"));
assert.ok(proposal.includes("secondCounter: 'Segundo conferente'"));
assert.ok(proposal.includes('sourceCaptureIds'));
assert.ok(roles.includes("return 'viewer';"), 'Default view must not be mislabeled accountant');
console.log('✅ Count team vs treasury vs accountant entry and terminology tests passed');
