import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

let assigned = '';
let replaced = '';
(globalThis as any).window = {
  location: {
    assign: (url: string) => { assigned = url; },
    replace: (url: string) => { replaced = url; },
  },
};

const lifecycle = await import('../src/services/ecosystemSessionLifecycle.js');

assert.equal(lifecycle.readNestFinanceSessionOrigin(), null);
lifecycle.markNestFinanceSessionOrigin('hub');
assert.equal(lifecycle.readNestFinanceSessionOrigin(), 'hub');

const launchUrl = new URL(lifecycle.buildMillionsNestLaunchUrl('/finance/review?status=pending'));
assert.equal(launchUrl.origin, 'https://www.millionsnest.com');
assert.equal(launchUrl.pathname, '/apps/nestfinance/launch');
assert.equal(launchUrl.searchParams.get('returnTo'), '/finance/review?status=pending');
assert.equal(new URL(lifecycle.buildMillionsNestLaunchUrl('https://evil.example')).searchParams.get('returnTo'), '/finance');

replaced = '';
assert.equal(lifecycle.recoverRevokedHubSession('/finance/balance'), true);
assert.equal(new URL(replaced).searchParams.get('returnTo'), '/finance/balance');

lifecycle.markNestFinanceSessionOrigin('direct');
replaced = '';
assert.equal(lifecycle.recoverRevokedHubSession('/finance'), false);
assert.equal(replaced, '');

lifecycle.openMillionsNestHome(false);
assert.equal(assigned, 'https://www.millionsnest.com/');
lifecycle.openMillionsNestHome(true);
assert.equal(replaced, 'https://www.millionsnest.com/');

lifecycle.markNestFinanceSessionOrigin('hub');
storage.set('mn_ecosystem_org_id', 'org-a');
storage.set('mn_sso_recovery_nestfinance', '1');
lifecycle.clearNestFinanceSessionLifecycle();
assert.equal(lifecycle.readNestFinanceSessionOrigin(), null);
assert.equal(storage.has('mn_ecosystem_org_id'), false);
assert.equal(storage.has('mn_sso_recovery_nestfinance'), false);

const [shellSource, moreSource, handoffSource, sessionSource] = await Promise.all([
  readFile('src/app/layouts/ShellLayout.tsx', 'utf8'),
  readFile('src/pages/finance/MorePage.tsx', 'utf8'),
  readFile('src/pages/auth/HandoffPage.tsx', 'utf8'),
  readFile('src/services/sessionResolutionService.ts', 'utf8'),
]);

for (const phrase of [
  'Voltar ao MillionsNest', 'Back to MillionsNest', 'Volver a MillionsNest',
  'Sair do NestFinance', 'Sign out of NestFinance', 'Salir de NestFinance',
]) {
  assert.ok(shellSource.includes(phrase) || moreSource.includes(phrase), 'missing lifecycle copy: ' + phrase);
}

assert.ok(shellSource.includes('signOutNestFinanceAndReturnToHub'));
assert.ok(moreSource.includes('signOutNestFinanceAndReturnToHub'));
assert.ok(handoffSource.includes("markNestFinanceSessionOrigin('hub')"));
assert.ok(sessionSource.includes('recoverRevokedHubSession'));

console.log('✅ NestFinance Hub return, local sign-out and revoked-session recovery lifecycle are certified.');
