import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const rootDir = process.cwd();
  
  // Canonical Contracts
  const contracts = [
    { method: 'POST', url: '/api/auth/handoff/redeem', operation: 'handoff-redeem', gateway: '/api/auth-gateway' },
    { method: 'POST', url: '/api/auth/session/resolve', operation: 'session-resolve', gateway: '/api/auth-gateway' },
    { method: 'POST', url: '/api/finance/setup/initialize', operation: 'setup-initialize', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/accounts/list', operation: 'accounts-list', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/accounts/create', operation: 'accounts-create', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/accounts/archive', operation: 'accounts-archive', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/accounts/reactivate', operation: 'accounts-reactivate', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/funds/list', operation: 'funds-list', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/funds/create', operation: 'funds-create', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/categories/list', operation: 'categories-list', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/categories/create', operation: 'categories-create', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/categories/archive', operation: 'categories-archive', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/categories/reactivate', operation: 'categories-reactivate', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/categories/update', operation: 'categories-update', gateway: '/api/finance-gateway' },
    { method: 'POST', url: '/api/finance/accounts/update', operation: 'accounts-update', gateway: '/api/finance-gateway' },
    { method: 'GET', url: '/api/system/release', operation: 'release', gateway: '/api/system-gateway' }
  ];

  // 1. Verify 15 URLs in vercel.json
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  const vercelJsonRaw = await fs.readFile(vercelJsonPath, 'utf8');
  const vercelJson = JSON.parse(vercelJsonRaw);
  const rewrites = vercelJson.rewrites || [];

  for (const doc of contracts) {
    const rewrite = rewrites.find((r) => r.source === doc.url);
    if (!rewrite) {
      console.error(`URL missing in vercel.json: ${doc.url}`);
      process.exit(1);
    }
    
    // 2. Each URL points to the correct gateway & operation
    const expectedDest = `${doc.gateway}?operation=${doc.operation}`;
    if (rewrite.destination !== expectedDest) {
      console.error(`Mismatch for ${doc.url}. Expected ${expectedDest}, got ${rewrite.destination}`);
      process.exit(1);
    }
  }

  // 4. Verify no old endpoint remains
  const oldFiles = contracts.map(c => path.join(rootDir, c.url + '.ts'));
  for (const oldFile of oldFiles) {
    let exists = false;
    try {
      await fs.access(oldFile);
      exists = true;
    } catch (e) {
      // expected
    }
    if (exists) {
      console.error(`Old endpoint remains: ${oldFile}`);
      process.exit(1);
    }
  }

  // Gateway allowlist validation: Verify operation exists in gateway file
  for (const doc of contracts) {
    const gatewayPath = path.join(rootDir, doc.gateway + '.ts');
    const gatewayContent = await fs.readFile(gatewayPath, 'utf8');
    if (!gatewayContent.includes(`case '${doc.operation}':`)) {
       console.error(`Operation ${doc.operation} missing from ${doc.gateway}`);
       process.exit(1);
    }
  }

  const postCount = contracts.filter(c => c.method === 'POST').length;
  const getCount = contracts.filter(c => c.method === 'GET').length;

  console.log(`API public contracts: ${contracts.length}`);
  console.log(`POST contracts: ${postCount}`);
  console.log(`GET contracts: ${getCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
