import { canManageFinanceEntities } from '../src/lib/permissions';

function testAccess() {
  let failed = 0;

  const runTest = (name: string, accessState: any, expected: boolean) => {
    const result = canManageFinanceEntities(accessState);
    if (result !== expected) {
      console.error(`TEST FAILED: ${name}. Expected ${expected}, got ${result}`);
      failed++;
    } else {
      console.log(`TEST PASSED: ${name}`);
    }
  };

  runTest('ceo canônico acessa', { status: 'granted', isGlobalAccess: true }, true);
  runTest('admin global canônico acessa', { status: 'granted', isGlobalAccess: true }, true);
  runTest('global_admin canônico acessa', { status: 'granted', isGlobalAccess: true }, true);
  
  runTest('owner da organização ativa acessa', { status: 'granted', capabilities: ['organization.manage_entities'] }, true);
  runTest('organization admin com capability acessa', { status: 'granted', capabilities: ['organization.manage_entities'] }, true);
  runTest('organization admin sem capability não acessa', { status: 'granted', capabilities: [] }, false);
  
  runTest('finance_admin sem capability organizacional não acessa', { status: 'granted', capabilities: ['finance.manage'] }, false);
  runTest('tesoureiro não acessa', { status: 'granted', capabilities: [] }, false);
  runTest('contador não acessa', { status: 'granted', capabilities: ['finance.view'] }, false);
  runTest('auditor não acessa', { status: 'granted', capabilities: ['finance.view'] }, false);
  runTest('membro comum não acessa', { status: 'granted', capabilities: [] }, false);
  runTest('usuário de outra organização não acessa', { status: 'granted', capabilities: [] }, false);

  if (failed > 0) process.exit(1);
  console.log('Permission core tests passed.');
}

testAccess();
