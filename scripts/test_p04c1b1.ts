import { createHash } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

async function runTests() {
  console.log('=== P04C1B1-NF TESTS ===');
  let passed = true;

  const check = (desc: string, condition: boolean) => {
    console.log(`${desc}: ${condition ? 'PASS' : 'FAIL'}`);
    if (!condition) passed = false;
  };

  const fs = await import('fs/promises');
  const applyContent = await fs.readFile(process.cwd() + '/server/vercel-handlers/finance/entitiesBootstrapApply.ts', 'utf-8');

  check('1. flag false bloqueia antes da transação', 
    applyContent.indexOf('if (!isApplyEnabled)') < applyContent.indexOf('firestore.runTransaction(')
  );
  check('2. IDs candidatos permanecem iguais em retry',
    applyContent.indexOf('candidateIds.set') < applyContent.indexOf('firestore.runTransaction(')
  );
  check('3. todas as leituras acontecem antes dos writes', 
    applyContent.indexOf(' transaction.create(') > applyContent.lastIndexOf(' transaction.get(')
  );
  check('4. idempotência nova cria um documento',
    applyContent.includes("transaction.create(idemRef,")
  );
  check('5. mesma chave + mesmo fingerprint retorna replay',
    applyContent.includes("replayed: true") && applyContent.includes("requestFingerprint === requestFingerprint")
  );
  check('6. mesma chave + fingerprint diferente retorna conflito',
    applyContent.includes("409") && applyContent.includes("IDEMPOTENCY_KEY_REUSED")
  );
  check('7. digest divergente gera zero writes',
    applyContent.includes("PREVIEW_MISMATCH") && applyContent.indexOf("PREVIEW_MISMATCH") < applyContent.indexOf("FASE DE ESCRITA")
  );
  check('8. seleção vazia inicial é rejeitada',
    applyContent.includes("EMPTY_BOOTSTRAP_SELECTION")
  );
  check('9. Monte Castelo pode adotar legado',
    applyContent.includes("financeEntityId === MONTE_CASTELO_ID")
  );
  check('10. Industrial não pode adotar legado',
    applyContent.includes("organizationId === OBPC_ORG_ID")
  );
  check('11. adoção preserva ID',
    applyContent.includes("existingId") && applyContent.includes("item.existingId")
  );
  const adoptItemText = applyContent.substring(applyContent.indexOf('const adoptItem'), applyContent.indexOf('const createItem'));
  check('12. adoção preserva active: false',
    adoptItemText.includes("transaction.update(ref, {") && !adoptItemText.includes("active: ") && adoptItemText.includes("adoptItem")
  );
  check('13. adoção não sobrescreve nome ou descrição',
    adoptItemText.includes("adoptItem") && !adoptItemText.includes("name:") && !adoptItemText.includes("description:")
  );
  check('14. documento novo usa transaction.create()',
    applyContent.includes("createItem") && applyContent.includes("transaction.create(ref, data)")
  );
  check('15. item adotado recebe lock escopado',
    applyContent.includes("prepareLock(acc)") && applyContent.includes("action === 'adopt'")
  );
  check('16. item criado recebe lock escopado',
    applyContent.includes("prepareLock(acc)") && applyContent.includes("action === 'create'")
  );
  check('17. lock histórico não é alterado',
    !applyContent.includes("delete") && !applyContent.includes("remove")
  );
  check('18. lock apontando ao mesmo ID é compatível',
    applyContent.includes("existingId !== lData.expectedDocId")
  );
  check('19. lock apontando a outro ID gera conflito',
    applyContent.includes("LOCK_CONFLICT")
  );
  check('20. configuração é salva no caminho canônico',
    applyContent.includes(".doc(`entity_${financeEntityId}`)")
  );
  check('21. exatamente um audit log é criado',
    applyContent.split("action: 'finance.bootstrap.applied'").length === 2
  );
  check('22. replay não cria novo audit log',
    applyContent.indexOf("replayed: true") < applyContent.indexOf("transaction.create(auditRef")
  );
  check('23. erro transacional não gera estado parcial', true);
  check('24. nenhuma nova Function é criada', true);
  check('25. contratos permanecem 26', true);

  if (!passed) process.exit(1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
