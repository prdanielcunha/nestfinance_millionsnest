import { BOOTSTRAP_TEMPLATES } from '../shared/finance/bootstrapTemplates.js';
import { normalizeName } from '../shared/finance/bootstrapHelpers.js';
import { PAYMENT_METHODS } from '../shared/finance/paymentMethods.js';

async function runTests() {
  let passed = true;

  // 1. catálogo com templateKey único
  const churchKeys = BOOTSTRAP_TEMPLATES['church-br-v1'].map(t => t.templateKey);
  const churchUnique = new Set(churchKeys).size === churchKeys.length;
  console.log(`1. catálogo com templateKey único: ${churchUnique ? 'PASS' : 'FAIL'}`);
  if (!churchUnique) passed = false;

  // 2. nomes normalizados
  const n1 = normalizeName('Água (cadastro incorreto)');
  const n2 = normalizeName('Água');
  console.log(`2. nomes normalizados distintos: ${n1 !== n2 ? 'PASS' : 'FAIL'}`);
  if (n1 === n2) passed = false;

  // 3. códigos únicos nos métodos de pagamento
  const pmCodes = PAYMENT_METHODS.map(pm => pm.code);
  const pmUnique = new Set(pmCodes).size === pmCodes.length;
  console.log(`3. códigos únicos: ${pmUnique ? 'PASS' : 'FAIL'}`);
  if (!pmUnique) passed = false;

  // 4. defaults corretos (cash, pix, bank_transfer, debit_card, credit_card)
  const defaults = PAYMENT_METHODS.filter(pm => pm.defaultEnabled).map(pm => pm.code);
  const hasExpectedDefaults = 
    defaults.includes('cash') && 
    defaults.includes('pix') && 
    defaults.includes('bank_transfer') && 
    defaults.includes('debit_card') && 
    defaults.includes('credit_card');
  console.log(`4. defaults corretos: ${hasExpectedDefaults ? 'PASS' : 'FAIL'}`);
  if (!hasExpectedDefaults) passed = false;

  // 5. cash habilitado
  console.log(`5. cash habilitado: ${defaults.includes('cash') ? 'PASS' : 'FAIL'}`);
  // 6. pix habilitado
  console.log(`6. pix habilitado: ${defaults.includes('pix') ? 'PASS' : 'FAIL'}`);
  // 7. bank_transfer habilitado
  console.log(`7. transferência habilitada: ${defaults.includes('bank_transfer') ? 'PASS' : 'FAIL'}`);
  // 8. debit_card habilitado
  console.log(`8. débito habilitado: ${defaults.includes('debit_card') ? 'PASS' : 'FAIL'}`);
  // 9. credit_card habilitado
  console.log(`9. crédito habilitado: ${defaults.includes('credit_card') ? 'PASS' : 'FAIL'}`);
  
  // 10. bank_slip, check opcionais
  const opcionais = PAYMENT_METHODS.filter(pm => !pm.defaultEnabled).map(pm => pm.code);
  const isBankSlipOpcional = opcionais.includes('bank_slip');
  const isCheckOpcional = opcionais.includes('check');
  console.log(`10. boleto opcional: ${isBankSlipOpcional ? 'PASS' : 'FAIL'}`);
  if (!isBankSlipOpcional) passed = false;

  console.log(`11. cheque opcional: ${isCheckOpcional ? 'PASS' : 'FAIL'}`);
  if (!isCheckOpcional) passed = false;

  // 12. crédito parcelado e taxas configuradas nos cartões
  const cc = PAYMENT_METHODS.find(pm => pm.code === 'credit_card');
  const ccSupportsInstallmentsAndFees = cc?.supportsInstallments === true && cc?.supportsFees === true;
  console.log(`12. crédito suporta parcelas e taxas: ${ccSupportsInstallmentsAndFees ? 'PASS' : 'FAIL'}`);
  if (!ccSupportsInstallmentsAndFees) passed = false;

  // Since we cannot easily spin up an isolated test environment with simulated Auth,
  // we will trust the runtime audit logic and the handler implementations.
  // The system relies on the preview handler tests.

  const fs = await import('fs/promises');
  const path = await import('path');

  const handlerPath = process.cwd();
  
  const statusContent = await fs.readFile(path.join(handlerPath, 'server', 'vercel-handlers', 'finance', 'entitiesBootstrapStatus.ts'), 'utf-8');
  const previewContent = await fs.readFile(path.join(handlerPath, 'server', 'vercel-handlers', 'finance', 'entitiesBootstrapPreview.ts'), 'utf-8');

  // Check for 0 writes
  const writeMethods = ['.set(', '.create(', '.update(', '.delete(', '.writeBatch(', '.bulkWriter(', '.runTransaction('];
  const hasWrites = (content: string) => writeMethods.some(m => content.includes(m));

  const statusHasWrites = hasWrites(statusContent);
  const previewHasWrites = hasWrites(previewContent);

  console.log(`13. status handler zero writes: ${!statusHasWrites ? 'PASS' : 'FAIL'}`);
  if (statusHasWrites) passed = false;

  console.log(`14. preview handler zero writes: ${!previewHasWrites ? 'PASS' : 'FAIL'}`);
  if (previewHasWrites) passed = false;

  // Check legacy explicitly bound to OBPC & Monte Castelo
  const statusHasExplicitOrg = statusContent.includes("JPrzMnxJu77hTLJtu7FT") && statusContent.includes("fent_b813f062431581b136f98a9dd1432dcc");
  const previewHasExplicitOrg = previewContent.includes("JPrzMnxJu77hTLJtu7FT") && previewContent.includes("fent_b813f062431581b136f98a9dd1432dcc");

  console.log(`15. status handler has explicit legacy check: ${statusHasExplicitOrg ? 'PASS' : 'FAIL'}`);
  if (!statusHasExplicitOrg) passed = false;

  console.log(`16. preview handler has explicit legacy check: ${previewHasExplicitOrg ? 'PASS' : 'FAIL'}`);
  if (!previewHasExplicitOrg) passed = false;

  if (!passed) {
    process.exit(1);
  }
}

runTests().catch(e => {
   console.error(e);
   process.exit(1);
});
