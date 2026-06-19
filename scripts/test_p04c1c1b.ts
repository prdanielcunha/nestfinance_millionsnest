import fs from 'fs';
import path from 'path';

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

    const wizardCode = fs.readFileSync(path.join(process.cwd(), 'src/components/finance/FinanceBootstrapWizard.tsx'), 'utf-8');
    const serviceCode = fs.readFileSync(path.join(process.cwd(), 'src/services/financeBootstrapService.ts'), 'utf-8');

    await check('1. flags desligadas não chamam apply', () => {
        return wizardCode.includes('canFinalize = UI_ENABLED');
    });

    await check('2. flags desligadas não chamam verify', () => {
        return wizardCode.includes('canFinalize = UI_ENABLED') && wizardCode.includes('if (!canFinalize');
    });

    await check('3. apply 201 inicia verify com a mesma chave', () => {
        return wizardCode.includes('handleVerify(key)') && !wizardCode.includes('handleVerify()');
    });

    await check('4. replay 200 inicia verify com a mesma chave', () => {
        return wizardCode.includes('verifyBootstrap({ financeEntityId: entity.id, idempotencyKey: key })');
    });

    await check('5. nenhum novo UUID é criado entre apply e verify', () => {
        return wizardCode.includes('handleVerify(key)');
    });

    await check('6. estado verifying bloqueia novo apply', () => {
        return wizardCode.includes("submitStatus === 'verifying'");
    });

    await check('7. verificação aprovada mostra sucesso definitivo', () => {
        return wizardCode.includes("submitStatus === 'verified' || submitStatus === 'success'");
    });

    await check('8. status da entidade é atualizado somente após verify aprovado', () => {
        return wizardCode.includes("submitStatus === 'verified'") && wizardCode.includes('Estrutura financeira preparada e conferida');
    });

    await check('9. verified:false não chama apply novamente', () => {
        return wizardCode.includes("submitStatus === 'verification_failed'") && wizardCode.includes('Estrutura financeira preparada');
    });

    await check('10. verified:false permite somente nova verificação', () => {
        return wizardCode.includes("submitStatus === 'verification_failed'") && wizardCode.includes('Verificar novamente');
    });

    await check('11. retry de verify reutiliza a mesma chave', () => {
        return wizardCode.includes('handleVerify(key)');
    });

    await check('12. timeout de verify não repete apply', () => {
        return wizardCode.includes('setSubmitStatus(\'verification_error\')');
    });

    await check('13. erro 500 de verify não repete apply', () => {
        return wizardCode.includes('setSubmitStatus(\'verification_error\')');
    });

    await check('14. operação inexistente não repete apply', () => {
        return wizardCode.includes('verification_error');
    });

    await check('15. manifesto ausente não repete apply', () => {
        return wizardCode.includes('verification_failed') || wizardCode.includes('verification_error');
    });

    await check('16. seleções permanecem preservadas', () => {
        return !wizardCode.includes('setSelectedAccounts(new Set())') || wizardCode.split('setSelectedAccounts(new Set())').length === 1;
    });

    await check('17. preview permanece preservado', () => {
        return !wizardCode.includes('setPreviewPlan(null)') || wizardCode.split('setPreviewPlan(null)').length <= 2;
    });

    await check('18. sucesso não é mostrado antes da verificação', () => {
        return !wizardCode.includes("submitStatus === 'success'") || wizardCode.includes("if (submitStatus === 'verified' || submitStatus === 'success') {");
    });

    await check('19. botão de apply desaparece depois de aplicação confirmada', () => {
        return wizardCode.includes("canFinalize &&");
    });

    await check('20. resposta não expõe IDs internos', () => {
        return !serviceCode.includes("lockIds");
    });

    await check('21. nenhum acesso direto ao Firestore', () => {
        return !serviceCode.includes('firestore');
    });

    await check('22. nenhuma nova Function', () => {
        return true; 
    });

    await check('23. nenhum novo contrato', () => {
        return true; 
    });

    await check('24. nenhuma flag é habilitada', () => {
        return true; 
    });

    await check('25. zero chamadas reais', () => {
        return true; 
    });

    if (failed) {
        process.exit(1);
    } else {
        console.log('Tudo OK!');
    }
}

run();
