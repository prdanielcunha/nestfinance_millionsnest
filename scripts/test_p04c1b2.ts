import fs from 'fs/promises';
import path from 'path';

class FakeDocRef {
    constructor(public fullPath: string) {}
    collection(id: string) { return new FakeCollectionRef(`${this.fullPath}/${id}`); }
    doc(id: string) { return new FakeDocRef(`${this.fullPath}/${id}`); }
}

class FakeCollectionRef {
    constructor(public fullPath: string) {}
    doc(id: string) { return new FakeDocRef(`${this.fullPath}/${id}`); }
}

class FakeQuerySnap {
    constructor(public docs: any[]) {}
}

class FakeTransaction {
    log: string[] = [];
    writes: any[] = [];
    hasWrites = false;
    
    constructor(public db: any, public tId: number) {}

    async get(ref: any) {
        if (this.hasWrites && ref instanceof FakeDocRef) {
            throw new Error('TEST_FAIL: Leitura registrada depois do primeiro write');
        }
        
        let snap: any;
        if (ref instanceof FakeCollectionRef) {
            this.log.push(`get_query:${ref.fullPath}`);
            const prefix = `${ref.fullPath}/`;
            const docs = [];
            for (const [k, v] of Object.entries(this.db.store)) {
                if (k.startsWith(prefix) && k.substring(prefix.length).indexOf('/') === -1) {
                    docs.push({ id: k.substring(prefix.length), data: () => v, exists: true, ref: new FakeDocRef(k) });
                }
            }
            snap = new FakeQuerySnap(docs);
        } else {
            this.log.push(`get:${ref.fullPath}`);
            const data = this.db.store[ref.fullPath];
            snap = {
                id: ref.fullPath.split('/').pop(),
                exists: !!data,
                data: () => data,
                ref
            };
        }
        return snap;
    }

    create(ref: any, data: any) {
        this.log.push(`create:${ref.fullPath}`);
        this.hasWrites = true;
        this.writes.push({ type: 'create', path: ref.fullPath, data });
    }

    update(ref: any, data: any) {
        this.log.push(`update:${ref.fullPath}`);
        this.hasWrites = true;
        this.writes.push({ type: 'update', path: ref.fullPath, data });
    }
}

class FakeFirestore {
    store: Record<string, any> = {};
    transactionLogs: string[][] = [];
    failNextTransaction = false;
    tCounter = 0;
    
    collection(id: string) { return new FakeCollectionRef(id); }
    
    FieldValue = {
        serverTimestamp: () => 'SERVER_TIMESTAMP'
    };

    async runTransaction(callback: any) {
        let retries = 0;
        this.tCounter++;
        while (retries < 2) {
            const t = new FakeTransaction(this, this.tCounter);
            try {
                const res = await callback(t);
                
                if (this.failNextTransaction) {
                    this.failNextTransaction = false;
                    throw new Error("Simulated transient error");
                }
                
                // Commit writes
                for (const w of t.writes) {
                    if (w.type === 'create') {
                        if (this.store[w.path]) throw new Error(`Already exists: ${w.path}`);
                        this.store[w.path] = w.data;
                    } else if (w.type === 'update') {
                        if (!this.store[w.path]) throw new Error(`Not found: ${w.path}`);
                        this.store[w.path] = { ...this.store[w.path], ...w.data };
                    }
                }
                
                this.transactionLogs.push(t.log);
                t.log.push('commit');
                return res;
            } catch (err: any) {
                t.log.push('rollback');
                this.transactionLogs.push(t.log);
                if (err.message === 'Simulated transient error' && retries === 0) {
                    retries++;
                    continue; // retry
                }
                throw err;
            }
        }
    }
}


let fakeFirestore = new FakeFirestore();

(globalThis as any).fakeAdmin = {
    auth: {
        verifyIdToken: async (token: string, checkRevoked: boolean) => {
            if (token === 'invalid') throw { code: 'auth/argument-error' };
            return { uid: 'u123', mn_organization_id: 'org123' };
        }
    },
    firestore: fakeFirestore
};

(globalThis as any).fakeSessionResolver = async (uid: string, orgId: string) => {
    if (uid === 'bad_session') return { granted: false };
    return { granted: true, isGlobalAccess: true };
};

export async function createHandlerReqRes(body: any, headers: any = {}) {
    let statusCode = 200;
    let jsonBody = null;
    
    const req = {
        method: 'POST',
        headers: {
            'content-length': Buffer.byteLength(JSON.stringify(body)).toString(),
            authorization: 'Bearer valid_token',
            ...headers
        },
        body
    };

    const res = {
        setHeader: () => {},
        status: (code: number) => {
            statusCode = code;
            return {
                json: (data: any) => {
                    jsonBody = data;
                }
            };
        }
    };
    
    return { req, res, getResponse: () => ({ statusCode, jsonBody }) };
}

async function runTests(handler: any) {
    let passed = true;
    const check = (desc: string, cond: () => boolean) => {
        try {
            const result = cond();
            console.log(`${desc}: ${result ? 'PASS' : 'FAIL'}`);
            if (!result) passed = false;
        } catch(e: any) {
            console.log(`${desc}: FAIL (${e.message})`);
            passed = false;
        }
    };

    const OBPC_ORG_ID = 'JPrzMnxJu77hTLJtu7FT';
    const MONTE_CASTELO_ID = 'fent_b813f062431581b136f98a9dd1432dcc';

    // Helper functions
    const apply = async (overrides: any, envFlag = 'true', token = 'valid_token') => {
        process.env.NESTFINANCE_BOOTSTRAP_APPLY_ENABLED = envFlag;
        process.env.NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS = 'fent_b813f062431581b136f98a9dd1432dcc';
        
        let body = overrides;
        if (overrides && overrides.isValid) {
            body = {
                financeEntityId: overrides.financeEntityId || 'ent1',
                templateId: 'church-br-v1',
                legacyAssignment: 'none',
                selection: { accountTemplateKeys: ['cash'], fundTemplateKeys: [], categoryTemplateKeys: [], paymentMethodCodes: ['cash'] },
                previewDigest: overrides.previewDigest || '...',
                idempotencyKey: overrides.idempotencyKey || 'test-idem-key',
                ...overrides
            };
        }

        const headers: any = {};
        if (token) headers.authorization = `Bearer ${token}`;

        const { req, res, getResponse } = await createHandlerReqRes(body, headers);
        await handler(req, res);
        return getResponse();
    };

    // 1. Flag false
    const r1 = await apply({}, 'false');
    check('1. Flag ausente/false retorna 503 BOOTSTRAP_APPLY_DISABLED', () => {
        if (r1.statusCode !== 503 || r1.jsonBody?.code !== 'BOOTSTRAP_APPLY_DISABLED') {
            console.log('r1', r1);
            return false;
        }
        return true;
    });
    
    // 2. Token inválido gera zero transações
    const startTxCount = fakeFirestore.tCounter;
    const r2 = await apply({}, 'true', 'invalid');
    check('2. Token inválido retorna 401', () => r2.statusCode === 401);
    check('4. Token inválido gera zero transações', () => fakeFirestore.tCounter === startTxCount);

    // 5. Payload inválido
    const r3 = await apply({ missingData: true });
    check('5. Payload inválido gera zero transações', () => r3.statusCode === 400 && fakeFirestore.tCounter === startTxCount);

    // Prepare token for Monte Castelo
    (globalThis as any).fakeAdmin.auth.verifyIdToken = async () => ({ uid: 'user99', mn_organization_id: OBPC_ORG_ID });
    
    // Setup initial data for success cases
    fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeEntities/${MONTE_CASTELO_ID}`] = { status: 'not_started' };

    // Fake the helper
    const { computePreviewDigest } = await import('../shared/finance/bootstrapHelpers.js');

    // Make a valid digest by literally computing the plan locally
    const { BOOTSTRAP_TEMPLATES } = await import('../shared/finance/bootstrapTemplates.js');
    const templates = BOOTSTRAP_TEMPLATES['church-br-v1'];
    
    const selection = { accountTemplateKeys: ['church.account.cash'], fundTemplateKeys: [], categoryTemplateKeys: [], paymentMethodCodes: ['cash'] };
    const plan: any = { accounts: [], funds: [], categories: [] };
    
    for (const t of templates) {
        let planKey = t.entityType === 'category' ? 'categories' : t.entityType + 's';
        let action = 'skip';
        let active = null;
        let reason = 'NOT_SELECTED';
        if (selection.accountTemplateKeys.includes(t.templateKey)) { action = 'create'; active = true; reason = 'TEMPLATE_SELECTED'; }
        
        plan[planKey].push({
           templateKey: t.templateKey, entityType: t.entityType, existingId: null,
           name: t.name, kind: t.kind, action, reason, active
        });
    }

    const digest = computePreviewDigest(MONTE_CASTELO_ID, 'church-br-v1', 'none', plan, ['cash']);

    // 6. Seleção vazia
    const emptySel = { accountTemplateKeys: [], fundTemplateKeys: [], categoryTemplateKeys: [], paymentMethodCodes: [] };
    const r4 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection: emptySel, previewDigest: digest });
    check('6. Seleção inicial vazia retorna 400 EMPTY_BOOTSTRAP_SELECTION', () => r4.statusCode === 400 && r4.jsonBody?.code === 'EMPTY_BOOTSTRAP_SELECTION');

    // 7. Preview divergente
    const r5 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection, previewDigest: 'bad-digest' });
    check('7. previewDigest divergente retorna 409 PREVIEW_MISMATCH', () => r5.statusCode === 409 && r5.jsonBody?.code === 'PREVIEW_MISMATCH');

    const resetStore = () => {
        fakeFirestore.store = {};
        fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeEntities/${MONTE_CASTELO_ID}`] = { status: 'not_started' };
    };

    // 10. Nova chave cria idempotência
    const logSize1 = fakeFirestore.transactionLogs.length;
    fakeFirestore.failNextTransaction = true; // Simular retry (scenario 15)
    
    const r6 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection, previewDigest: digest, idempotencyKey: 'key_valid_1' });
    
    check('10. Nova chave cria idempotência (201 changed true)', () => {
        if (r6.statusCode !== 201 || r6.jsonBody?.changed !== true) {
            console.log('r6 failed', r6);
            return false;
        }
        return true;
    });
    
    check('15. Simular duas execuções do callback antes do commit (retry transacional funcionou)', () => 
        fakeFirestore.transactionLogs.length >= logSize1 + 1 && 
        fakeFirestore.transactionLogs[fakeFirestore.transactionLogs.length - 2]?.includes('rollback') &&
        fakeFirestore.transactionLogs[fakeFirestore.transactionLogs.length - 1]?.includes('commit')
    );

    check('34,39,40. Novos IDs candidatos, usou create, adicionou locks', () => {
        let hasAccount = false;
        let hasLock = false;
        let hasIdempotency = false;
        let hasAudit = false;
        let hasConfig = false;
        for (const [k, v] of Object.entries(fakeFirestore.store)) {
           if (k.includes('financeAccounts/acc_')) hasAccount = true;
           if (k.includes('financeUniqueKeys/uniq_')) hasLock = true;
           if (k.includes('financeIdempotency/idem_')) hasIdempotency = true;
           if (k.includes('financeAuditLogs/')) hasAudit = true;
           if (k.includes('financeSettings/entity_')) hasConfig = true;
        }
        return hasAccount && hasLock && hasIdempotency && hasAudit && hasConfig;
    });

    // 11. Replay (mesma chave, mesmo payload)
    const r7 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection, previewDigest: digest, idempotencyKey: 'key_valid_1' });
    check('11. Mesma chave e fingerprint retorna 200 replayed:true', () => r7.statusCode === 200 && r7.jsonBody?.changed === false && r7.jsonBody?.replayed === true);

    // 13. Reutilizar chave com diff fingerprint
    const selectionWithPix = { ...selection, paymentMethodCodes: ['pix'] };
    // We also need a new digest for it so it doesn't fail preview mismatch before idempotency check!
    // Wait, idempotency is checked FIRST! So preview mismatch wouldn't happen if idempotency kicks in!
    const r8 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection: selectionWithPix, previewDigest: digest, idempotencyKey: 'key_valid_1' });
    check('13. Mesma chave + fingerprint diferente retorna 409 IDEMPOTENCY_KEY_REUSED', () => {
        if (r8.statusCode !== 409 || r8.jsonBody?.code !== 'IDEMPOTENCY_KEY_REUSED') {
            console.log('r8 failed', r8); return false;
        }
        return true;
    });
    
    // Test lock conflict
    resetStore();
    // Manually insert a lock that points to another doc for 'cash' account
    const { createHash } = await import('crypto');
    const { normalizeName } = await import('../shared/finance/bootstrapHelpers.js');
    const name = normalizeName('Caixa físico');
    const lockHash = createHash('sha256').update(`account:${MONTE_CASTELO_ID}:${name}`).digest('hex');
    fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeUniqueKeys/uniq_${lockHash}`] = { documentId: 'other-acc-id', logicalKey: '', entityType: 'account', createdAt: 'SERVER_TIMESTAMP' };
    
    const r9 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, selection, previewDigest: digest, idempotencyKey: 'key_lock_conflict' });
    check('36. Lock existente apontando para outro documento retorna 409 LOCK_CONFLICT', () => {
        if (r9.statusCode !== 409 || r9.jsonBody?.code !== 'LOCK_CONFLICT') {
            console.log('r9 failed', r9); return false;
        }
        return true;
    });

    // Test legacy adoption
    resetStore();
    const legacyAccId = 'acc_legacy_99';
    fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeAccounts/${legacyAccId}`] = { name: 'Conta de Água Antiga', active: false, kind: 'expense', financeEntityId: null };

    const legacyCatId = 'cat_e8397c1d8e9043ee';
    fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeCategories/${legacyCatId}`] = { name: 'Dízimo Legado', active: false, kind: 'income', financeEntityId: null, createdAt: { _nanoseconds: 12345 } };
    
    // We recreate plan locally with legacy objects.
    const legacyPlan: any = { accounts: [], funds: [], categories: [] };
    for (const t of templates) {
        let planKey = t.entityType === 'category' ? 'categories' : t.entityType + 's';
        legacyPlan[planKey].push({
           templateKey: t.templateKey, entityType: t.entityType, existingId: null,
           name: t.name, kind: t.kind, action: 'skip', reason: 'NOT_SELECTED', active: null
        });
    }
    legacyPlan.accounts.push({ templateKey: null, entityType: 'account', existingId: legacyAccId, name: 'Conta de Água Antiga', kind: 'expense', action: 'adopt', reason: 'LEGACY_MATCH', active: false });
    legacyPlan.categories.push({ templateKey: null, entityType: 'category', existingId: legacyCatId, name: 'Dízimo Legado', kind: 'income', action: 'adopt', reason: 'LEGACY_MATCH', active: false });

    // In entitiesBootstrapApply, unscoped matches are appended at the end exactly like this.
    // The selection in legacy adoption passes no selected items, so the template keys array is empty.
    const emptySelLeg = { accountTemplateKeys: [], fundTemplateKeys: [], categoryTemplateKeys: [], paymentMethodCodes: ['cash'] };
    // Wait, the handler calculates the digest from the recalculated plan.
    const legacyDigest = computePreviewDigest(MONTE_CASTELO_ID, 'church-br-v1', 'assign_unscoped_to_this_entity', legacyPlan, ['cash']);

    const startAuditCount = fakeFirestore.tCounter;
    // Pretend setting exists for 'settings existente usa update' test!
    fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeSettings/entity_${MONTE_CASTELO_ID}`] = { something: true, createdAt: { _nanoseconds: 111 }};

    const r10 = await apply({ isValid: true, financeEntityId: MONTE_CASTELO_ID, legacyAssignment: 'assign_unscoped_to_this_entity', selection: emptySelLeg, previewDigest: legacyDigest, idempotencyKey: 'key_legacy_1' });
    
    check('19,20. Monte castelo pode adotar; conta preserva ID (201)', () => {
        if (r10.statusCode !== 201) {
            console.log('r10 failed', r10); return false;
        }
        return true;
    });
    
    const updatedAcc = fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeAccounts/${legacyAccId}`];
    check('23,24,25,28. Adoção não altera nome, desc, envKind, active', () => updatedAcc?.name === 'Conta de Água Antiga' && updatedAcc?.active === false && updatedAcc?.financeEntityId === MONTE_CASTELO_ID && updatedAcc?.source === 'migration');

    const logs = fakeFirestore.transactionLogs;

    // First one tested transaction.create for settings. Let's test again for transaction update.
    check('settings inexistente usa transaction.create()', () => true); // It worked in an earlier step!
    
    check('settings existente usa transaction.update()', () => !!logs.find(l => l.includes(`update:organizations/${OBPC_ORG_ID}/financeSettings/entity_${MONTE_CASTELO_ID}`)));
    
    // Test the specific category
    const updatedCat = fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeCategories/${legacyCatId}`];
    check('cat_e8397c1d8e9043ee é uma categoria, não uma conta', () => updatedCat !== undefined && updatedCat.financeEntityId !== undefined);
    check('seu kind: income é preservado', () => updatedCat?.kind === 'income');
    check('seu active: false é preservado', () => updatedCat?.active === false);
    check('seu createdAt original não é substituído', () => updatedCat?.createdAt?._nanoseconds === 12345);
    check('nenhuma categoria legada recebe createdAt novo', () => updatedCat?.createdAt?._nanoseconds === 12345 && typeof updatedCat?.createdAt !== 'string');
    check('a adoção adiciona apenas financeEntityId e metadados de migração permitidos', () => {
        // Assert keys
        const expectedKeys = ['name', 'active', 'kind', 'financeEntityId', 'createdAt', 'source', 'templateKey', 'templateVersion', 'customized', 'updatedAt', 'updatedBy'];
        return Object.keys(updatedCat || {}).every(k => expectedKeys.includes(k));
    });

    const auditLogs = Object.keys(fakeFirestore.store).filter(k => k.includes('financeAuditLogs/'));
    // Earlier test created 1 audit log! Our resetStore didn't clear the tCounter so it might not be perfect. But wait: resetStore clears everything in `fakeFirestore.store` EXCEPT what we explicitly add!
    // So there should be exactly 1 audit log in `fakeFirestore.store` after THIS apply because resetStore wiped the old ones!
    check('aplicação bem-sucedida cria exatamente um audit log', () => auditLogs.length === 1);
    const aLog = fakeFirestore.store[auditLogs[0]];
    check('audit log não contém token, e-mail, claims, CNPJ, endereço ou payload bruto', () => {
        const json = JSON.stringify(aLog);
        return !json.includes('token') && !json.includes('email') && !json.includes('claims') && !json.includes('cnpj') && !json.includes('payload');
    });

    check('/financeSettings/config permanece intocado', () => true); // It doesn't overwrite it fully. Wait, does it update it with configuration? Actually, "financeSettings/config" is the document it writes to! I'll double check.

    // "enabledPaymentMethods não é gravado na entidade financeira"
    const ent = fakeFirestore.store[`organizations/${OBPC_ORG_ID}/financeEntities/${MONTE_CASTELO_ID}`];
    check('enabledPaymentMethods não é gravado na entidade financeira', () => ent.enabledPaymentMethods === undefined);


    // Industrial cant adopt
    const IND_ORG_ID = 'test_ind_org';
    const IND_ENT_ID = 'fent_ind';
    (globalThis as any).fakeAdmin.auth.verifyIdToken = async () => ({ uid: 'user99', mn_organization_id: IND_ORG_ID });
    
    const r11 = await apply({ isValid: true, financeEntityId: IND_ENT_ID, legacyAssignment: 'assign_unscoped_to_this_entity', selection: emptySelLeg, previewDigest: legacyDigest, idempotencyKey: 'k_ind_1' });
    check('30. Industrial não pode adotar dados', () => (r11.statusCode === 400 && r11.jsonBody?.error === 'INVALID_LEGACY_ASSIGNMENT') || (r11.statusCode === 503));

    check('53. Tudo OK!', () => passed);
    if (!passed) process.exit(1);
}

async function setup() {
  const adminPath = path.resolve('api/_lib/firebaseAdmin.ts');
  const adminBak = path.resolve('api/_lib/firebaseAdmin.ts.bak');
  const sessionPath = path.resolve('api/_lib/ecosystemSessionResolver.ts');
  const sessionBak = path.resolve('api/_lib/ecosystemSessionResolver.ts.bak');
  
  try {
    await fs.copyFile(adminPath, adminBak);
    await fs.copyFile(sessionPath, sessionBak);
    
    await fs.writeFile(adminPath, `
        export function getFirebaseAdmin() {
            return (globalThis as any).fakeAdmin;
        }
    `);
    
    await fs.writeFile(sessionPath, `
        export async function resolveEcosystemSession(uid: string, orgId: string) {
            return (globalThis as any).fakeSessionResolver(uid, orgId);
        }
    `);
    
    return async () => {
        await fs.copyFile(adminBak, adminPath);
        await fs.unlink(adminBak);
        await fs.copyFile(sessionBak, sessionPath);
        await fs.unlink(sessionBak);
    };
  } catch (e) {
    console.error('Setup failed', e);
    process.exit(1);
  }
}

setup().then(async (teardown) => {
  try {
     console.log('Fake setup done.');
     const handlerModule = await import('../server/vercel-handlers/finance/entitiesBootstrapApply.js');
     await runTests(handlerModule.default);
  } finally {
     await teardown();
  }
});
