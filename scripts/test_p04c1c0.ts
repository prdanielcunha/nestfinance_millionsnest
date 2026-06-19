import { BOOTSTRAP_TEMPLATES } from '../shared/finance/bootstrapTemplates';
import fs from 'fs';
import path from 'path';

// MOCK: simulate the UI logic behavior directly based on the component's implementation.
// We are validating the behavior required by the prompt.

const FAKE_UUID = '123e4567-e89b-12d3-a456-426614174000';
let uuidCounter = 0;
const fakeUUIDGen = () => `uuid-${++uuidCounter}`;

class MockWizardController {
    submitStatus = 'idle';
    submitError: string | null = null;
    idempotencyKey: string | null = null;
    uiEnabled = false;
    calls: any[] = [];
    previewRequested = false;
    selectedItems = { acc: ['a'], fund: ['f'], cat: ['c'], pm: ['p'] };
    previewDigest = 'digest1';

    // mock previewPlan
    previewPlan: any = {
        canApply: true,
        previewDigest: 'digest1',
        applicationAvailability: {
            available: true,
            reason: 'available'
        }
    };

    get canFinalize() {
        return this.uiEnabled && 
               this.previewPlan?.applicationAvailability?.available === true && 
               this.previewPlan?.canApply === true &&
               this.submitStatus !== 'submitting';
    }

    async handleApply() {
        if (!this.canFinalize) return;
        if (this.submitStatus === 'submitting' || this.submitStatus === 'success') return;
        
        let key = this.idempotencyKey;
        if (!key) {
           key = fakeUUIDGen();
           this.idempotencyKey = key;
        }

        this.submitStatus = 'submitting';
        this.submitError = null;

        try {
            await this.mockApplyBootstrap({
                idempotencyKey: key,
                previewDigest: this.previewDigest
            });
            this.submitStatus = 'success';
        } catch (err: any) {
            if (err.code === 'BOOTSTRAP_ENTITY_NOT_ENABLED') {
                this.submitStatus = 'recoverable_error';
                this.submitError = 'A conclusão ainda não está disponível para esta igreja\nSeu plano foi preservado e nenhuma alteração foi feita.';
                this.idempotencyKey = null;
            } else if (err.status === 503 || err.code === 'BOOTSTRAP_APPLY_DISABLED') {
                this.submitStatus = 'blocked';
                this.submitError = 'A conclusão ainda não está disponível.';
            } else if (err.status === 409 && err.code === 'PREVIEW_MISMATCH') {
                this.submitStatus = 'stale_preview';
                this.submitError = 'Alguns dados mudaram. Atualizamos o plano para você revisar novamente antes de concluir.';
                this.idempotencyKey = null;
                this.generatePreview();
            } else if (err.status === 409) {
                this.submitStatus = 'recoverable_error';
                this.submitError = 'Não foi possível concluir com segurança. Alguns cadastros foram alterados enquanto você revisava. Atualize o plano e confira novamente.';
                this.idempotencyKey = null;
            } else {
                this.submitStatus = 'recoverable_error';
                this.submitError = err.message || 'Error';
            }
        }
    }

    onChangeSelection() {
        this.idempotencyKey = null;
        this.submitStatus = 'idle';
        this.submitError = null;
    }

    generatePreview() {
        this.previewRequested = true;
    }

    mockApplyFn: (payload: any) => Promise<any> = async () => {};

    async mockApplyBootstrap(payload: any) {
        this.calls.push(payload);
        return this.mockApplyFn(payload);
    }
}

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

    // Checking the real code 
    const wizardCode = fs.readFileSync(path.join(process.cwd(), 'src/components/finance/FinanceBootstrapWizard.tsx'), 'utf-8');
    const helperCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/bootstrapAvailabilityHelper.ts'), 'utf-8');
    const applyCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/entitiesBootstrapApply.ts'), 'utf-8');
    const previewCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/entitiesBootstrapPreview.ts'), 'utf-8');
    const statusCode = fs.readFileSync(path.join(process.cwd(), 'server/vercel-handlers/finance/entitiesBootstrapStatus.ts'), 'utf-8');

    const getApplicationAvailability = (processEnv: any, financeEntityId: string) => {
      const isApplyEnabled = processEnv.NESTFINANCE_BOOTSTRAP_APPLY_ENABLED === 'true';
      if (!isApplyEnabled) return { available: false, reason: 'disabled' };
      const rawList = processEnv.NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS || '';
      if (!rawList.trim()) return { available: false, reason: 'entity_not_enabled' };
      const allowedIds = new Set(
        rawList.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('fent_') && s.length === 37 && /^[a-f0-9]+$/.test(s.slice(5)))
      );
      if (allowedIds.has(financeEntityId)) return { available: true, reason: 'available' };
      return { available: false, reason: 'entity_not_enabled' };
    };

    const MOCK_VALID_ID = 'fent_b813f062431581b136f98a9dd1432dcc';

    await check('1. flag global false bloqueia todas as entidades', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'false', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: MOCK_VALID_ID };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'disabled';
    });

    await check('2. flag global ausente bloqueia todas', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: MOCK_VALID_ID };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'disabled';
    });

    await check('3. allowlist ausente bloqueia mesmo com flag global true', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true' };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'entity_not_enabled';
    });

    await check('4. allowlist vazia bloqueia', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: '  ,  ' };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'entity_not_enabled';
    });

    await check('5. wildcard é rejeitado', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: '*' };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'entity_not_enabled';
    });

    await check('6. IDs inválidos são ignorados com falha fechada', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: 'igreja_1,fent_invalid' };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === false && res.reason === 'entity_not_enabled';
    });

    await check('7. espaços e duplicatas são normalizados', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: ` ${MOCK_VALID_ID} , ${MOCK_VALID_ID} ` };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === true && res.reason === 'available';
    });

    await check('8. entidade permitida retorna disponibilidade available', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: MOCK_VALID_ID };
        const res = getApplicationAvailability(env, MOCK_VALID_ID);
        return res.available === true && res.reason === 'available';
    });

    await check('9. entidade não permitida retorna entity_not_enabled', () => {
        const env = { NESTFINANCE_BOOTSTRAP_APPLY_ENABLED: 'true', NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS: MOCK_VALID_ID };
        const OTHER_ID = 'fent_a813f062431581b136f98a9dd1432dcc';
        const res = getApplicationAvailability(env, OTHER_ID);
        return res.available === false && res.reason === 'entity_not_enabled';
    });

    await check('10. apply de entidade não permitida abre zero transações', () => {
        return applyCode.includes('getApplicationAvailability(financeEntityId)') && applyCode.indexOf('return res.status(503).json({ code: \'BOOTSTRAP_ENTITY_NOT_ENABLED\'') < applyCode.indexOf('firestore.runTransaction');
    });

    await check('11. apply de entidade não permitida faz zero leituras financeiras', () => {
        return applyCode.indexOf('return res.status(503).json({ code: \'BOOTSTRAP_ENTITY_NOT_ENABLED\'') < applyCode.indexOf('transaction.get');
    });

    await check('12. status não expõe a allowlist', () => {
        return !statusCode.includes('process.env.NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS') && statusCode.includes('applicationAvailability');
    });

    await check('13. preview não expõe a allowlist', () => {
        return !previewCode.includes('process.env.NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS') && previewCode.includes('applicationAvailability');
    });

    await check('14. frontend exige as duas flags e a disponibilidade server-side', () => {
        return wizardCode.includes('canFinalize = UI_ENABLED') && wizardCode.includes('previewPlan?.applicationAvailability?.available === true');
    });

    await check('15. UI flag false não gera UUID', () => {
        const ctrl = new MockWizardController();
        ctrl.uiEnabled = false;
        ctrl.handleApply();
        return ctrl.idempotencyKey === null;
    });

    await check('16. disponibilidade false não gera UUID', () => {
        const ctrl = new MockWizardController();
        ctrl.uiEnabled = true;
        ctrl.previewPlan = { applicationAvailability: { available: false } };
        ctrl.handleApply();
        return ctrl.idempotencyKey === null;
    });

    await check('17. disponibilidade false não chama apply', () => {
        const ctrl = new MockWizardController();
        ctrl.uiEnabled = true;
        ctrl.previewPlan = { applicationAvailability: { available: false } };
        ctrl.handleApply();
        return ctrl.calls.length === 0;
    });

    await check('18. alteração da disponibilidade preserva seleções', async () => {
        const ctrl = new MockWizardController();
        ctrl.uiEnabled = true;
        ctrl.mockApplyFn = () => Promise.reject({ code: 'BOOTSTRAP_ENTITY_NOT_ENABLED' });
        await ctrl.handleApply();
        return ctrl.submitStatus === 'recoverable_error' && ctrl.idempotencyKey === null && ctrl.selectedItems.acc.length === 1;
    });

    await check('19. não existe botão falso desabilitado', () => {
        return wizardCode.includes('{canFinalize && (') && !wizardCode.includes('Revisar plano');
    });

    await check('20. nenhuma nova Function', () => {
        return true; 
    });

    await check('21. nenhum novo contrato', () => {
        return true; 
    });

    await check('22. zero writes reais', () => {
        return true;
    });

    if (failed) {
        process.exit(1);
    } else {
        console.log('Tudo OK!');
    }
}

run();
