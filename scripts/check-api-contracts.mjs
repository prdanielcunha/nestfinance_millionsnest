import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const GATEWAY_CONTRACTS = [
  { method: 'POST', gateway: '/api/auth-gateway', operation: 'handoff-redeem', exposure: 'rewrite', url: '/api/auth/handoff/redeem' },
  { method: 'POST', gateway: '/api/auth-gateway', operation: 'session-resolve', exposure: 'rewrite', url: '/api/auth/session/resolve' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'setup-initialize', exposure: 'rewrite', url: '/api/finance/setup/initialize' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-list', exposure: 'rewrite', url: '/api/finance/accounts/list' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-create', exposure: 'rewrite', url: '/api/finance/accounts/create' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-archive', exposure: 'rewrite', url: '/api/finance/accounts/archive' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-reactivate', exposure: 'rewrite', url: '/api/finance/accounts/reactivate' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-update', exposure: 'rewrite', url: '/api/finance/accounts/update' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-repair-canonical', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'accounts-configure-custom', exposure: 'gateway' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'funds-list', exposure: 'rewrite', url: '/api/finance/funds/list' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'funds-create', exposure: 'rewrite', url: '/api/finance/funds/create' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'funds-archive', exposure: 'rewrite', url: '/api/finance/funds/archive' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'funds-reactivate', exposure: 'rewrite', url: '/api/finance/funds/reactivate' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'categories-list', exposure: 'rewrite', url: '/api/finance/categories/list' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'categories-create', exposure: 'rewrite', url: '/api/finance/categories/create' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'categories-archive', exposure: 'rewrite', url: '/api/finance/categories/archive' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'categories-reactivate', exposure: 'rewrite', url: '/api/finance/categories/reactivate' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'categories-update', exposure: 'rewrite', url: '/api/finance/categories/update' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-cnpj-lookup', exposure: 'rewrite', url: '/api/finance/entities/cnpj-lookup' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-create', exposure: 'rewrite', url: '/api/finance/entities/create' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-list', exposure: 'rewrite', url: '/api/finance/entities/list' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-detail', exposure: 'rewrite', url: '/api/finance/entities/detail' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-update', exposure: 'rewrite', url: '/api/finance/entities/update' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-bootstrap-status', exposure: 'rewrite', url: '/api/finance/entities/bootstrap/status' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-bootstrap-preview', exposure: 'rewrite', url: '/api/finance/entities/bootstrap/preview' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-bootstrap-apply', exposure: 'rewrite', url: '/api/finance/entities/bootstrap/apply' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'entities-bootstrap-verify', exposure: 'rewrite', url: '/api/finance/entities/bootstrap/verify' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-list', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-summary', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-detail', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-create-draft', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-create-and-submit', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-update-draft', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-submit-review', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-return-to-draft', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-invalidate-approval', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-approve-for-posting', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-repair-approval-verification', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'transactions-posting-plan-preview', exposure: 'gateway' },

  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-list', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-create', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-detail', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-save-first-count', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-start-second-count', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-submit-second-count', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-start-recount', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-sessions-submit-recount', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-paper-forms-generate', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-paper-forms-detail', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-start', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-finalize', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-detail', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-extract-candidates', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-extract-denominations', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-save-review', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'count-captures-save-denomination-review', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'universal-evidence-start', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'universal-evidence-finalize', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'universal-evidence-list', exposure: 'gateway' },
  { method: 'POST', gateway: '/api/finance-gateway', operation: 'universal-evidence-detail', exposure: 'gateway' },

  { method: 'GET', gateway: '/api/system-gateway', operation: 'release', exposure: 'rewrite', url: '/api/system/release' },
];

export const GATEWAY_FILES = {
  '/api/auth-gateway': 'api/auth-gateway.ts',
  '/api/finance-gateway': 'api/finance-gateway.ts',
  '/api/system-gateway': 'api/system-gateway.ts',
};

export function extractGatewayOperations(source) {
  return [...source.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map((match) => match[1]);
}

export function validateGatewayInventory({ contracts, gatewaySources, rewrites }) {
  const errors = [];
  const contractKeys = new Set();
  const rewriteUrls = new Set();

  for (const contract of contracts) {
    const key = `${contract.gateway}::${contract.operation}`;
    if (contractKeys.has(key)) errors.push(`Duplicate gateway contract: ${key}`);
    contractKeys.add(key);
    if (!GATEWAY_FILES[contract.gateway]) errors.push(`Unknown gateway in contract: ${contract.gateway}`);

    if (contract.exposure === 'rewrite') {
      if (!contract.url) errors.push(`Rewrite contract missing url: ${key}`);
      else if (rewriteUrls.has(contract.url)) errors.push(`Duplicate contract URL: ${contract.url}`);
      else rewriteUrls.add(contract.url);
    } else if (contract.exposure !== 'gateway') {
      errors.push(`Invalid exposure '${contract.exposure}' for ${key}`);
    }
  }

  for (const [gateway, source] of Object.entries(gatewaySources)) {
    const cases = extractGatewayOperations(source);
    const caseSet = new Set(cases);
    if (caseSet.size !== cases.length) errors.push(`Duplicate switch case detected in ${gateway}`);

    for (const operation of caseSet) {
      const key = `${gateway}::${operation}`;
      if (!contractKeys.has(key)) errors.push(`Uncertified gateway operation: ${key}`);
    }
    for (const contract of contracts.filter((item) => item.gateway === gateway)) {
      if (!caseSet.has(contract.operation)) errors.push(`Certified operation missing from gateway: ${gateway}::${contract.operation}`);
    }
  }

  for (const contract of contracts.filter((item) => item.exposure === 'rewrite')) {
    const rewrite = rewrites.find((item) => item.source === contract.url);
    if (!rewrite) {
      errors.push(`URL missing in vercel.json: ${contract.url}`);
      continue;
    }
    const expectedDestination = `${contract.gateway}?operation=${contract.operation}`;
    if (rewrite.destination !== expectedDestination) errors.push(`Mismatch for ${contract.url}. Expected ${expectedDestination}, got ${rewrite.destination}`);
  }

  for (const rewrite of rewrites) {
    const match = /^\/api\/(auth|finance|system)-gateway\?operation=([^&]+)$/.exec(rewrite.destination || '');
    if (!match) continue;
    const gateway = `/api/${match[1]}-gateway`;
    const operation = match[2];
    const contract = contracts.find((item) => item.gateway === gateway && item.operation === operation);
    if (!contract) {
      errors.push(`Uncertified gateway rewrite: ${rewrite.source} -> ${rewrite.destination}`);
      continue;
    }
    if (contract.exposure !== 'rewrite' || contract.url !== rewrite.source) {
      errors.push(`Rewrite is not represented exactly by contract: ${rewrite.source} -> ${rewrite.destination}`);
    }
  }
  return errors;
}

export async function runApiContractCheck(rootDir = process.cwd(), fsImpl = fs) {
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  const vercelJsonRaw = await fsImpl.readFile(vercelJsonPath, 'utf8');
  const vercelJson = JSON.parse(vercelJsonRaw);
  const rewrites = vercelJson.rewrites || [];
  const gatewaySources = {};
  for (const [gateway, relativePath] of Object.entries(GATEWAY_FILES)) {
    gatewaySources[gateway] = await fsImpl.readFile(path.join(rootDir, relativePath), 'utf8');
  }

  const errors = validateGatewayInventory({ contracts: GATEWAY_CONTRACTS, gatewaySources, rewrites });
  for (const contract of GATEWAY_CONTRACTS.filter((item) => item.url)) {
    const oldFile = path.join(rootDir, `${contract.url}.ts`);
    try {
      await fsImpl.access(oldFile);
      errors.push(`Old endpoint remains: ${oldFile}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  if (errors.length > 0) throw new Error(`API contract certification failed:\n- ${errors.join('\n- ')}`);

  const postCount = GATEWAY_CONTRACTS.filter((item) => item.method === 'POST').length;
  const getCount = GATEWAY_CONTRACTS.filter((item) => item.method === 'GET').length;
  const rewriteCount = GATEWAY_CONTRACTS.filter((item) => item.exposure === 'rewrite').length;
  const directGatewayCount = GATEWAY_CONTRACTS.filter((item) => item.exposure === 'gateway').length;
  console.log(`Certified gateway operations: ${GATEWAY_CONTRACTS.length}`);
  console.log(`POST operations: ${postCount}`);
  console.log(`GET operations: ${getCount}`);
  console.log(`Friendly rewrites: ${rewriteCount}`);
  console.log(`Direct gateway operations: ${directGatewayCount}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  runApiContractCheck().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
