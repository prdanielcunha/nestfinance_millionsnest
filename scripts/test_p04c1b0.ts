import { createHash } from 'crypto';
import { computePreviewDigest } from '../shared/finance/bootstrapHelpers.js';

async function runTests() {
  let passed = true;

  console.log("=== P04C1B0-NF TESTS ===");

  // 1. mesmo plano semântico gera o mesmo digest
  const planA: any = { accounts: [], funds: [], categories: [] };
  const d1 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['cash']);
  const d2 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['cash']);
  console.log(`1. Same plan generates same digest: ${d1 === d2 ? 'PASS' : 'FAIL'}`);
  if (d1 !== d2) passed = false;

  // 2. ordem diferente nas seleções gera o mesmo digest (payment methods)
  const d3 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['cash', 'pix']);
  const d4 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['pix', 'cash']);
  console.log(`2. Different order in selections (PMs) generates same digest: ${d3 === d4 ? 'PASS' : 'FAIL'}`);
  if (d3 !== d4) passed = false;

  // 3. ordem diferente dos itens gera o mesmo digest
  const planItemsA: any = { accounts: [{ entityType: 'account', templateKey: 'k1', name: 'N 1' }, { entityType: 'account', templateKey: 'k2', name: 'N 2' }], funds: [], categories: [] };
  const planItemsB: any = { accounts: [{ entityType: 'account', templateKey: 'k2', name: 'N 2' }, { entityType: 'account', templateKey: 'k1', name: 'N 1' }], funds: [], categories: [] };
  const d5 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsA, ['cash']);
  const d6 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsB, ['cash']);
  console.log(`3. Different order of items generates same digest: ${d5 === d6 ? 'PASS' : 'FAIL'}`);
  if (d5 !== d6) passed = false;

  // 4. mudança de ação altera o digest
  const planItemsAct1: any = { accounts: [{ entityType: 'account', templateKey: 'k1', name: 'N 1', action: 'create' }], funds: [], categories: [] };
  const planItemsAct2: any = { accounts: [{ entityType: 'account', templateKey: 'k1', name: 'N 1', action: 'skip' }], funds: [], categories: [] };
  const d7 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct1, ['cash']);
  const d8 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct2, ['cash']);
  console.log(`4. Change in action alters digest: ${d7 !== d8 ? 'PASS' : 'FAIL'}`);
  if (d7 === d8) passed = false;

  // 5. mudança de active altera o digest
  const planItemsAct3: any = { accounts: [{ entityType: 'account', templateKey: 'k1', name: 'N 1', active: true }], funds: [], categories: [] };
  const planItemsAct4: any = { accounts: [{ entityType: 'account', templateKey: 'k1', name: 'N 1', active: false }], funds: [], categories: [] };
  const d9 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct3, ['cash']);
  const d10 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct4, ['cash']);
  console.log(`5. Change in active alters digest: ${d9 !== d10 ? 'PASS' : 'FAIL'}`);
  if (d9 === d10) passed = false;

  // 6. mudança de kind altera o digest (category only but tests logic)
  const planItemsAct5: any = { categories: [{ entityType: 'category', templateKey: 'k1', name: 'N 1', kind: 'income' }], funds: [], accounts: [] };
  const planItemsAct6: any = { categories: [{ entityType: 'category', templateKey: 'k1', name: 'N 1', kind: 'expense' }], funds: [], accounts: [] };
  const d11 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct5, ['cash']);
  const d12 = computePreviewDigest('ent1', 'church-br-v1', 'none', planItemsAct6, ['cash']);
  console.log(`6. Change in kind alters digest: ${d11 !== d12 ? 'PASS' : 'FAIL'}`);
  if (d11 === d12) passed = false;

  // 7. mudança nos métodos habilitados altera o digest
  const d13 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['cash']);
  const d14 = computePreviewDigest('ent1', 'church-br-v1', 'none', planA, ['cash', 'pix']);
  console.log(`7. Change in enabled methods alters digest: ${d13 !== d14 ? 'PASS' : 'FAIL'}`);
  if (d13 === d14) passed = false;

  // Code inspection for specific apply requirements
  const fs = await import('fs/promises');
  const path = await import('path');
  const handlerPath = process.cwd();
  const applyContent = await fs.readFile(path.join(handlerPath, 'server', 'vercel-handlers', 'finance', 'entitiesBootstrapApply.ts'), 'utf-8');

  const check = (desc: string, condition: boolean) => {
      console.log(`${desc}: ${condition ? 'PASS' : 'FAIL'}`);
      if (!condition) passed = false;
  }

  check('8. Check for POST limit', applyContent.includes("req.method !== 'POST'"));
  check('9. Check for apply flag check', applyContent.includes("process.env.NESTFINANCE_BOOTSTRAP_APPLY_ENABLED === 'true'"));
  check('10. Endpoint disabled returns 503 BOOTSTRAP_APPLY_DISABLED', applyContent.includes("503") && applyContent.includes("BOOTSTRAP_APPLY_DISABLED"));
  
  const writeMethods = ['.set(', '.create(', '.update(', '.delete(', '.writeBatch(', '.bulkWriter(', '.runTransaction('];
  const hasWrites = writeMethods.some(m => applyContent.includes(m));
  
  check('11. Endpoint executed zero writes (no batch/transaction)', !hasWrites);
  check('12. No implementation beyond returning NOT_IMPLEMENTED or DISABLED error', applyContent.includes("501") && applyContent.includes("NOT_IMPLEMENTED"));

  if (!passed) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
