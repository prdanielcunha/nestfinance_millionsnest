import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real UI callbacks with synthetic session services. A same-UID
// custom-token exchange does not guarantee an onAuthStateChanged notification.
const source = readFileSync('src/app/layouts/ShellLayout.tsx', 'utf8');
const ast = ts.createSourceFile('ShellLayout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name: string): string {
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      result = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `missing UI callback ${name}`);
  return ts.transpileModule(`globalThis.handler = ${result}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const selected = callback('selectOrganization');
const opened = callback('openOrganizationSwitcher');
function harness(code: string, result: any, fail = false) {
  const events: string[] = [];
  let finish!: () => void;
  const exchanged = new Promise<void>((resolve) => { finish = resolve; });
  async function exchange() {
    await exchanged;
    if (fail) throw new Error('synthetic exchange failure');
    events.push('token_persisted');
    return result;
  }
  const scope: any = {
    setOrganizationSwitcherError: (error: boolean) => { if (error) events.push('error'); },
    setOrganizationSwitcherLoading: () => {},
    setOrganizationSwitcherOpen: () => {},
    setOrganizationOptions: () => {},
    setActiveFinanceEntityId: (value: any) => { assert.equal(value, null); events.push('clear_entity'); },
    chooseCurrentSessionOrganization: exchange,
    resolveCurrentSessionOrganizations: exchange,
    refreshAccessibleFinanceEntities: () => { events.push('stale_refresh'); },
    navigate: () => { events.push('spa_navigation'); },
    accessState: { organizationId: 'org_synthetic_old' },
    APP_ROUTES: { finance: '/finance' },
    window: { location: { replace: (url: string) => { assert.equal(url, '/finance'); events.push('new_document'); } } },
  };
  vm.runInNewContext(code, scope);
  return { events, finish, run: () => scope.handler('org_synthetic_new') };
}
for (const code of [selected, opened]) {
  const h = harness(code, { status: 'ready', organization: { id: 'org_synthetic_new' } });
  const pending = h.run();
  assert.deepEqual(h.events, [], 'must not navigate before validated token exchange completes');
  h.finish();
  await pending;
  assert.deepEqual(h.events, ['token_persisted', 'clear_entity', 'new_document']);
}
for (const fail of [false, true]) {
  const h = harness(selected, { status: 'no_access' }, fail);
  const pending = h.run(); h.finish(); await pending;
  assert.ok(h.events.includes('error'));
  assert.ok(!h.events.includes('new_document'), 'denial or failure must not activate organization');
  assert.ok(!h.events.includes('clear_entity'));
}
const same = harness(opened, { status: 'ready', organization: { id: 'org_synthetic_old' } });
const pendingSame = same.run(); same.finish(); await pendingSame;
assert.ok(!same.events.includes('new_document'), 'opening selector must not reload unchanged organization');
console.log('PASS organization switch: wait for canonical token, recreate all consumers, preserve denied context.');
