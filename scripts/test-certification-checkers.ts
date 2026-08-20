import assert from 'assert';
import {
  GATEWAY_CONTRACTS,
  GATEWAY_FILES,
  validateGatewayInventory,
} from './check-api-contracts.mjs';
import {
  analyzeFinanceHandler,
  runSaasIsolationCheck,
} from './check-saas-isolation.js';

function buildGatewaySources() {
  const result: Record<string, string> = {};
  for (const gateway of Object.keys(GATEWAY_FILES)) {
    const cases = GATEWAY_CONTRACTS
      .filter((contract) => contract.gateway === gateway)
      .map((contract) => `case '${contract.operation}': return;`)
      .join('\n');
    result[gateway] = `switch (operation) {\n${cases}\ndefault: return;\n}`;
  }
  return result;
}

function buildRewrites() {
  return GATEWAY_CONTRACTS
    .filter((contract) => contract.exposure === 'rewrite')
    .map((contract) => ({
      source: contract.url,
      destination: `${contract.gateway}?operation=${contract.operation}`,
    }));
}

async function run() {
  console.log('Running certification checker self-tests...');
  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  await check('inventário canônico dos gateways é autoconsistente', () => {
    const errors = validateGatewayInventory({
      contracts: GATEWAY_CONTRACTS,
      gatewaySources: buildGatewaySources(),
      rewrites: buildRewrites(),
    });
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(GATEWAY_CONTRACTS.length, 60);
    assert.strictEqual(GATEWAY_CONTRACTS.filter((item) => item.gateway === '/api/finance-gateway').length, 57);
  });

  await check('operação de gateway não certificada falha', () => {
    const gatewaySources = buildGatewaySources();
    gatewaySources['/api/finance-gateway'] += "\ncase 'unsafe-unmodeled-operation': return;";
    const errors = validateGatewayInventory({
      contracts: GATEWAY_CONTRACTS,
      gatewaySources,
      rewrites: buildRewrites(),
    });
    assert.ok(errors.some((error) => error.includes('Uncertified gateway operation')));
  });

  await check('contrato declarado sem case real falha', () => {
    const gatewaySources = buildGatewaySources();
    gatewaySources['/api/auth-gateway'] = gatewaySources['/api/auth-gateway'].replace(
      "case 'session-resolve': return;",
      '',
    );
    const errors = validateGatewayInventory({
      contracts: GATEWAY_CONTRACTS,
      gatewaySources,
      rewrites: buildRewrites(),
    });
    assert.ok(errors.some((error) => error.includes('Certified operation missing from gateway')));
  });

  await check('rewrite divergente falha', () => {
    const rewrites = buildRewrites();
    const target = rewrites.find((rewrite) => rewrite.source === '/api/auth/session/resolve');
    assert.ok(target);
    target!.destination = '/api/auth-gateway?operation=handoff-redeem';
    const errors = validateGatewayInventory({
      contracts: GATEWAY_CONTRACTS,
      gatewaySources: buildGatewaySources(),
      rewrites,
    });
    assert.ok(errors.some((error) => error.includes('Mismatch for /api/auth/session/resolve')));
  });

  await check('organizationId vindo do body é rejeitado pelo checker SaaS', () => {
    const violations = analyzeFinanceHandler(
      'unsafeBodyOrg.ts',
      `export default async function handler(req, res) {
        const { organizationId } = req.body;
        const x = firestore.collection('organizations').doc(organizationId).collection('financeEntities');
        return res.json(x);
      }`,
    );
    assert.ok(violations.some((item) => item.includes('organizationId from req.body')));
  });

  await check('coleção financeira raiz é rejeitada', () => {
    const violations = analyzeFinanceHandler(
      'unsafeRoot.ts',
      `export default async function handler(req, res) {
        const organizationId = decodedToken.mn_organization_id;
        resolveEcosystemSession(uid, organizationId);
        const x = db.collection('financeTransactions');
        return res.json(x);
      }`,
    );
    assert.ok(violations.some((item) => item.includes('root finance collection')));
  });

  await check('coleção sensível sem guard de entidade é rejeitada', () => {
    const violations = analyzeFinanceHandler(
      'unsafeEntityScope.ts',
      `export default async function handler(req, res) {
        const organizationId = decodedToken.mn_organization_id;
        resolveEcosystemSession(uid, organizationId);
        const x = firestore.collection('organizations').doc(organizationId).collection('financeTransactions').get();
        return res.json(x);
      }`,
    );
    assert.ok(violations.some((item) => item.includes('entity-scope guard')));
  });

  await check('handler com contexto financeiro compartilhado é aceito', () => {
    const violations = analyzeFinanceHandler(
      'safeHandler.ts',
      `export default async function handler(req, res) {
        const { db, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.view');
        const ref = context.repository.getTransactionsQuery().where('transactionId', '==', 'tx');
        return res.json(await ref.get());
      }`,
    );
    assert.deepStrictEqual(violations, []);
  });

  await check('erro inesperado de filesystem não é engolido pelo checker SaaS', async () => {
    const failingFs = {
      async readdir() {
        throw new Error('synthetic-readdir-failure');
      },
      async readFile() {
        return '';
      },
    } as any;

    await assert.rejects(
      () => runSaasIsolationCheck('/synthetic', failingFs),
      /synthetic-readdir-failure/,
    );
  });

  console.log(`\nCertification Checker Totals: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
