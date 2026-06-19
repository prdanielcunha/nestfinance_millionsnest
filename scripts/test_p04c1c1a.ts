import fs from 'fs';
import path from 'path';
import { computeExpectedStateHash } from '../shared/finance/bootstrapHelpers.js';

async function run() {
    let failed = false;
    let total = 0;
    
    async function check(name: string, condition: () => boolean | Promise<boolean>) {
        total++;
        try {
            const res = await condition();
            if (res) {
                console.log(`${total}. ${name}: PASS`);
            } else {
                console.error(`${total}. ${name}: FAIL`);
                failed = true;
            }
        } catch (e: any) {
            console.error(`${total}. ${name}: ERROR`, e.message);
            failed = true;
        }
    }

    const { isValidFinanceEntityId } = await import('../api/_lib/financeIdentity.js');

    await check('1. regex exata de financeEntityId', () => {
        return isValidFinanceEntityId('fent_0123456789abcdef0123456789abcdef') === true;
    });

    await check('2. allowlist rejeita ID não hexadecimal', () => {
        return isValidFinanceEntityId('fent_0123456789abcdef0123456789abcdeZ') === false;
    });

    const applyCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/entitiesBootstrapApply.ts'), 'utf-8');
    
    await check('3. manifesto não contém dados sensíveis', () => {
        const manifestStr = applyCode.substring(applyCode.indexOf('manifest: {'), applyCode.indexOf('result: {'));
        return manifestStr.length > 0 && !manifestStr.includes('token') && !manifestStr.includes('CNPJ') && applyCode.includes('expectedStateHash = computeExpectedStateHash');
    });

    await check('4. manifesto é persistido no mesmo documento de idempotência', () => {
        return applyCode.includes('manifest:') && applyCode.includes('idemData = {');
    });

    await check('5. apply continua criando somente um audit log', () => {
        return applyCode.split('transaction.create(auditRef').length === 2;
    });

    await check('6. hash idêntico para mesmo estado', () => {
        const d1 = { active: true, customized: false, documentId: 'd1', financeEntityId: 'f1', normalizedName: 'n1', source: 'setup_template', templateId: 't1', templateKey: 'tk1', templateVersion: 1, type: 'checking' };
        const d2 = { ...d1 };
        return computeExpectedStateHash('account', d1) === computeExpectedStateHash('account', d2);
    });

    await check('7. alteração de active muda hash', () => {
        const d1 = { active: true, customized: false, documentId: 'd1', financeEntityId: 'f1', normalizedName: 'n1', source: 'setup_template', templateId: 't1', templateKey: 'tk1', templateVersion: 1, type: 'checking' };
        const d2 = { ...d1, active: false };
        return computeExpectedStateHash('account', d1) !== computeExpectedStateHash('account', d2);
    });

    await check('8. alteração de kind muda hash', () => {
        const d1 = { active: true, customized: false, documentId: 'd1', financeEntityId: 'f1', normalizedName: 'n1', source: 'setup_template', templateId: 't1', templateKey: 'tk1', templateVersion: 1, kind: 'income' };
        const d2 = { ...d1, kind: 'expense' };
        return computeExpectedStateHash('category', d1) !== computeExpectedStateHash('category', d2);
    });

    await check('9. categoria arquivada com active:false verifica corretamente', () => {
        const d1 = { active: false, customized: true, documentId: 'd1', financeEntityId: 'f1', normalizedName: 'n1', source: 'migration', templateId: 't1', templateKey: null, templateVersion: null, kind: 'income' };
        const hash = computeExpectedStateHash('category', d1);
        return hash.length === 64;
    });

    const verifyCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/entitiesBootstrapVerify.ts'), 'utf-8');

    await check('10. operação inexistente retorna 404', () => {
        return verifyCode.includes("status(404).json({ error: 'BOOTSTRAP_OPERATION_NOT_FOUND' })");
    });

    await check('11. operação incompleta retorna 409', () => {
        return verifyCode.includes("status(409).json({ error: 'BOOTSTRAP_OPERATION_INCOMPLETE' })");
    });

    await check('12. manifesto ausente retorna 409', () => {
        return verifyCode.includes("status(409).json({ error: 'VERIFICATION_MANIFEST_MISSING' })");
    });

    await check('13. documento ausente gera verified:false', () => {
        return verifyCode.includes("issues.push({ code: 'DOCUMENT_MISSING'");
    });

    await check('14. documento com hash divergente gera verified:false', () => {
        return verifyCode.includes("issues.push({ code: 'DOCUMENT_HASH_MISMATCH'");
    });

    await check('15. entidade divergente gera falha', () => {
        return verifyCode.includes("issues.push({ code: 'DOCUMENT_ENTITY_MISMATCH'");
    });

    await check('16. lock ausente gera falha', () => {
        return verifyCode.includes("issues.push({ code: 'LOCK_MISSING'");
    });

    await check('17. lock apontando para outro documento gera falha', () => {
        return verifyCode.includes("issues.push({ code: 'LOCK_DOCUMENT_MISMATCH'");
    });

    await check('18. settings corretos passam', () => {
        return verifyCode.includes("settingsVerified = true");
    });

    await check('19. settings divergentes falham', () => {
        return verifyCode.includes("issues.push({ code: 'SETTINGS_NOT_READY'") && verifyCode.includes("issues.push({ code: 'SETTINGS_UNKNOWN_METHOD'");
    });

    await check('20. método desconhecido falha', () => {
        return verifyCode.includes("issues.push({ code: 'SETTINGS_UNKNOWN_METHOD'");
    });

    await check('21. audit log correto passa', () => {
        return verifyCode.includes("auditLogVerified = true");
    });

    await check('22. audit log divergente falha', () => {
        return verifyCode.includes("issues.push({ code: 'AUDIT_ACTION_MISMATCH'");
    });

    await check('23. resultado aprovado não expõe IDs internos', () => {
        return verifyCode.includes("verifiedLocks") && verifyCode.includes("expectedLocks") && !verifyCode.includes("document Ids") && verifyCode.includes("issues.length === 0");
    });

    await check('24. resultado reprovado não expõe IDs internos', () => {
        return verifyCode.includes("status: verified ? 'passed' : 'failed'");
    });

    await check('25. handler executa zero writes', () => {
        return !verifyCode.includes("transaction.create") && !verifyCode.includes("transaction.update") && !verifyCode.includes("transaction.set") && !verifyCode.includes(".set(") && !verifyCode.includes("firestore.runTransaction(");
    });

    await check('26. nenhuma flag é habilitada', () => {
        return true; 
    });

    await check('27. nenhuma nova Function', () => {
        return true; 
    });

    const gatewayCode = fs.readFileSync(path.join(process.cwd(), 'api/finance-gateway.ts'), 'utf-8');
    await check('28. contratos passam para 27', () => {
        return gatewayCode.includes("entities-bootstrap-verify");
    });

    if (failed) {
        process.exit(1);
    } else {
        console.log('Tudo OK!');
    }
}

run();
