import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { canManageFinanceBootstrap } from './bootstrapAvailabilityHelper.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const isEmergencyDisabled = process.env.NESTFINANCE_BOOTSTRAP_EMERGENCY_DISABLED === 'true';
  if (isEmergencyDisabled) {
    return res.status(503).json({ code: 'BOOTSTRAP_APPLY_DISABLED', error: 'Apply endpoint is currently disabled' });
  }

  if (!FieldValue || typeof FieldValue.serverTimestamp !== 'function') {
    return res.status(500).json({ code: 'SERVER_TIMESTAMP_UNAVAILABLE', error: 'Server timestamp helper is unavailable' });
  }


  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 16384) {
    return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

    const idToken = authHeader.split('Bearer ')[1];

    let admin;
    try {
      admin = getFirebaseAdmin();
    } catch (err: any) {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }

    const { auth, firestore } = admin;

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);
    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const { financeEntityId, templateId, legacyAssignment, selection, previewDigest, idempotencyKey } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string' || !templateId || !selection || !previewDigest || !idempotencyKey) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const access = await requireFinanceEntityAccess({
      db: firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionGranted: true
    });

    const { randomUUID, createHash } = await import('crypto');
    const { BOOTSTRAP_TEMPLATES } = await import('../../../shared/finance/bootstrapTemplates.js');
    const { computePreviewDigest, normalizeName, computeExpectedStateHash, normalizeExpectedBootstrapState } = await import('../../../shared/finance/bootstrapHelpers.js');
    const { generateStableId } = await import('../../../api/_lib/financeIdentity.js');
    const { getApplicationAvailability } = await import('./bootstrapAvailabilityHelper.js');
    const { normalizeAccountType, getAccountNature } = await import('../../../shared/finance/smartLogic.js');

    const appAvailability = await getApplicationAvailability(financeEntityId);
    if (!appAvailability.available) {
       return res.status(503).json({ code: 'BOOTSTRAP_ENTITY_NOT_ENABLED', error: 'Apply endpoint is currently disabled for this entity' });
    }

    const templates = BOOTSTRAP_TEMPLATES[templateId as keyof typeof BOOTSTRAP_TEMPLATES];
    if (!templates) {
       return res.status(400).json({ error: 'INVALID_TEMPLATE_ID' });
    }

    if (legacyAssignment === 'assign_unscoped_to_this_entity') {
       return res.status(400).json({ error: 'INVALID_LEGACY_ASSIGNMENT' });
    }

    if (!Array.isArray(selection.accountTemplateKeys) || !Array.isArray(selection.fundTemplateKeys) || !Array.isArray(selection.categoryTemplateKeys) || !Array.isArray(selection.paymentMethodCodes)) {
       return res.status(400).json({ error: 'INVALID_SELECTION' });
    }

    if (selection.accountTemplateKeys.length === 0 && selection.fundTemplateKeys.length === 0 && selection.categoryTemplateKeys.length === 0 && selection.paymentMethodCodes.length === 0) {
       return res.status(400).json({ code: 'EMPTY_BOOTSTRAP_SELECTION', error: 'Selection is empty' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);

    const idempotencyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const idempotencyDocumentId = `idem_${idempotencyHash}`;

    // Request fingerprint
    const sortedPMs = [...selection.paymentMethodCodes].sort();
    const sortedAccounts = [...selection.accountTemplateKeys].sort();
    const sortedFunds = [...selection.fundTemplateKeys].sort();
    const sortedCategories = [...selection.categoryTemplateKeys].sort();
    
    const intentPayload = {
       financeEntityId, templateId, legacyAssignment,
       accounts: sortedAccounts, funds: sortedFunds, categories: sortedCategories,
       paymentMethodCodes: sortedPMs, previewDigest
    };
    const requestFingerprint = createHash('sha256').update(JSON.stringify(intentPayload)).digest('hex');

    const requestId = randomUUID();
    const auditId = randomUUID();

    // Prepare candidate IDs mapping
    const candidateIds = new Map<string, string>();
    for (const k of selection.accountTemplateKeys) candidateIds.set(`account:${k}`, generateStableId('acc'));
    for (const k of selection.fundTemplateKeys) candidateIds.set(`fund:${k}`, generateStableId('fund'));
    for (const k of selection.categoryTemplateKeys) candidateIds.set(`category:${k}`, generateStableId('cat'));

    let transactionResult: any = null;

    try {
        await firestore.runTransaction(async (transaction: any) => {
            // 1. ler idempotência
            const idemRef = orgRef.collection('financeIdempotency').doc(idempotencyDocumentId);
            const idemDoc = await transaction.get(idemRef);
            
            if (idemDoc.exists) {
                // 2. replay válido ou conflito
                if (idemDoc.data().requestFingerprint === requestFingerprint) {
                    transactionResult = { replayed: true, result: idemDoc.data().result };
                    return;
                } else {
                    throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', error: 'Idempotency key reused with different payload' };
                }
            }

            // 4. ler a entidade financeira
            const entityRef = orgRef.collection('financeEntities').doc(financeEntityId);
            const entityDoc = await transaction.get(entityRef);
            if (!entityDoc.exists) throw { status: 404, code: 'ENTITY_NOT_FOUND', error: 'Finance entity not found' };

            // 5. ler configuração da entidade
            const settingsRef = orgRef.collection('financeSettings').doc(`entity_${financeEntityId}`);
            const settingsDoc = await transaction.get(settingsRef);

            // 6,7,8. ler contas/fundos/categorias (We need unscoped + scoped only, but for transactions we can fetch the entire collection or specific queries. Wait, we can't do .where() in transactions across everything easily in admin sdk, wait we CAN do .where().get() in transaction but it's better to get them directly.
            // Actally, transaction.get(query) works in Admin SDK:
            const accountsQuery = orgRef.collection('financeAccounts').where('financeEntityId', '==', financeEntityId);
            const fundsQuery = orgRef.collection('financeFunds').where('financeEntityId', '==', financeEntityId);
            const categoriesQuery = orgRef.collection('financeCategories').where('financeEntityId', '==', financeEntityId);

            const [accountsSnap, fundsSnap, categoriesSnap] = await Promise.all([
               transaction.get(accountsQuery),
               transaction.get(fundsQuery),
               transaction.get(categoriesQuery)
            ]);

            const unscopedAccounts: any[] = [];
            const unscopedFunds: any[] = [];
            const unscopedCategories: any[] = [];

            const scopedAccounts = accountsSnap.docs;
            const scopedFunds = fundsSnap.docs;
            const scopedCategories = categoriesSnap.docs;

            // 9. Recalcular plano
            const plan: any = { accounts: [], funds: [], categories: [] };
            const summary = { adopt: 0, create: 0, skip: 0, conflict: 0 };
            
            const processItems = (type: 'account' | 'fund' | 'category', unscoped: any[], scoped: any[], selectedKeys: string[]) => {
               const templateItems = templates.filter(t => t.entityType === type);
               const handledUnscopedIds = new Set<string>();
               const planKey = type === 'category' ? 'categories' : type + 's';

               for (const tItem of templateItems) {
                  const isSelected = selectedKeys.includes(tItem.templateKey);
                  const normalized = normalizeName(tItem.name);
                  
                  let collisionWithScoped = scoped.find(s => {
                     const sn = normalizeName(s.data().name);
                     if (type === 'category') return sn === normalized && s.data().kind === tItem.kind;
                     return sn === normalized;
                  });

                  if (collisionWithScoped) {
                     plan[planKey].push({
                        templateKey: tItem.templateKey, entityType: type, existingId: collisionWithScoped.id,
                        name: tItem.name, kind: tItem.kind, action: 'conflict', reason: 'ALREADY_SCOPED', active: collisionWithScoped.data().active,
                        originalData: collisionWithScoped.data()
                     });
                     summary.conflict++;
                     continue;
                  }

                  let legacyMatch = unscoped.find(u => {
                     const un = normalizeName(u.data().name);
                     if (type === 'category') return un === normalized && u.data().kind === tItem.kind;
                     return un === normalized;
                  });

                  if (legacyMatch) {
                     plan[planKey].push({
                        templateKey: tItem.templateKey, entityType: type, existingId: legacyMatch.id,
                        name: legacyMatch.data().name || tItem.name, kind: tItem.kind, action: 'adopt',
                        reason: 'LEGACY_MATCH', active: legacyMatch.data().active,
                        originalData: legacyMatch.data()
                     });
                     summary.adopt++;
                     handledUnscopedIds.add(legacyMatch.id);
                  } else {
                     if (isSelected) {
                        plan[planKey].push({
                           templateKey: tItem.templateKey, entityType: type, existingId: null,
                           name: tItem.name, kind: tItem.kind, action: 'create',
                           reason: 'TEMPLATE_SELECTED', active: true, originalData: null
                        });
                        summary.create++;
                     } else {
                        plan[planKey].push({
                           templateKey: tItem.templateKey, entityType: type, existingId: null,
                           name: tItem.name, kind: tItem.kind, action: 'skip',
                           reason: 'NOT_SELECTED', active: null, originalData: null
                        });
                        summary.skip++;
                     }
                  }
               }

               for (const u of unscoped) {
                  if (!handledUnscopedIds.has(u.id)) {
                     plan[planKey].push({
                         templateKey: null, entityType: type, existingId: u.id,
                         name: u.data().name, kind: u.data().kind, action: 'adopt',
                         reason: 'LEGACY_MATCH', active: u.data().active,
                         originalData: u.data()
                     });
                     summary.adopt++;
                  }
               }
            };

            processItems('account', unscopedAccounts, scopedAccounts, selection.accountTemplateKeys);
            processItems('fund', unscopedFunds, scopedFunds, selection.fundTemplateKeys);
            processItems('category', unscopedCategories, scopedCategories, selection.categoryTemplateKeys);

            const sortPlanItems = (items: any[]) => items.sort((a, b) => {
               if (a.templateKey && b.templateKey) return a.templateKey.localeCompare(b.templateKey);
               if (a.templateKey && !b.templateKey) return -1;
               if (!a.templateKey && b.templateKey) return 1;
               if (a.existingId && b.existingId) return a.existingId.localeCompare(b.existingId);
               return 0;
            });

            plan.accounts = sortPlanItems(plan.accounts);
            plan.funds = sortPlanItems(plan.funds);
            plan.categories = sortPlanItems(plan.categories);

            // 10. Comparar digest
            const serverDigest = computePreviewDigest(financeEntityId, templateId, legacyAssignment, plan, selection.paymentMethodCodes);
            if (serverDigest !== previewDigest) {
                throw { status: 409, code: 'PREVIEW_MISMATCH', error: 'Preview digest does not match. Data has changed.' };
            }

            if (summary.conflict > 0) {
               throw { status: 409, code: 'BOOTSTRAP_CONFLICT', error: 'There are plan conflicts.' };
            }

            // 11, 12. Locks
            const locksRefs: any[] = [];
            const locksData: any[] = [];

            const prepareLock = (item: any) => {
               const normName = normalizeName(item.name);
               let logicalKey = '';
               if (item.entityType === 'category') logicalKey = `category:${financeEntityId}:${item.kind}:${normName}`;
               else logicalKey = `${item.entityType}:${financeEntityId}:${normName}`;

               const hash = createHash('sha256').update(logicalKey).digest('hex');
               const lockId = `uniq_${hash}`;
               const lockRef = orgRef.collection('financeUniqueKeys').doc(lockId);

               const futureDocId = item.action === 'adopt' ? item.existingId : candidateIds.get(`${item.entityType}:${item.templateKey}`);

               locksRefs.push(lockRef);
               locksData.push({ lockId, logicalKey, expectedDocId: futureDocId, item });
            };

            for (const acc of plan.accounts) { if (acc.action === 'create' || acc.action === 'adopt') prepareLock(acc); }
            for (const fnd of plan.funds) { if (fnd.action === 'create' || fnd.action === 'adopt') prepareLock(fnd); }
            for (const cat of plan.categories) { if (cat.action === 'create' || cat.action === 'adopt') prepareLock(cat); }

            // Fetch all locks (in chunks of 10? runTransaction allows get(ref) sequentially or Promise.all given ref array is small)
            const lockDocs = await Promise.all(locksRefs.map((ref: any) => transaction.get(ref)));

            for (let i = 0; i < lockDocs.length; i++) {
               const lockDoc = lockDocs[i];
               const lData = locksData[i];
               if (lockDoc.exists) {
                   const existingId = lockDoc.data().documentId;
                   if (existingId !== lData.expectedDocId) {
                       throw { status: 409, code: 'LOCK_CONFLICT', error: `Lock conflict for ${lData.logicalKey}` };
                   }
               }
            }

            // === FASE DE ESCRITA ===
            const ts = FieldValue.serverTimestamp();

            // 1. Criar locks
            for (let i = 0; i < lockDocs.length; i++) {
               if (!lockDocs[i].exists) {
                   transaction.create(locksRefs[i], {
                       logicalKey: locksData[i].logicalKey,
                       documentId: locksData[i].expectedDocId,
                       entityType: locksData[i].item.entityType,
                       createdAt: ts
                   });
               }
            }

            // 2. Adopt
            const adoptItem = (item: any, collection: string) => {
               if (item.action !== 'adopt') return;
               const ref = orgRef.collection(collection).doc(item.existingId);
               transaction.update(ref, {
                   financeEntityId,
                   source: 'migration',
                   templateKey: item.templateKey || null,
                   templateVersion: item.templateKey ? 1 : null,
                   customized: true,
                   updatedAt: ts,
                   updatedBy: uid
               });
            };

            for (const i of plan.accounts) adoptItem(i, 'financeAccounts');
            for (const i of plan.funds) adoptItem(i, 'financeFunds');
            for (const i of plan.categories) adoptItem(i, 'financeCategories');

            // 3. Create
            const createItem = (item: any, collection: string) => {
               if (item.action !== 'create') return;
               const docId = candidateIds.get(`${item.entityType}:${item.templateKey}`);
               const ref = orgRef.collection(collection).doc(docId);
               const data: any = {
                   financeEntityId,
                   name: item.name,
                   active: true,
                   source: 'setup_template',
                   templateId,
                   templateKey: item.templateKey,
                   templateVersion: 1,
                   customized: false,
                   createdAt: ts,
                   createdBy: uid,
                   updatedAt: ts,
                   updatedBy: uid
               };
               if (item.entityType === 'category') data.kind = item.kind;
               if (item.entityType === 'account') {
                   const tItem = templates.find(t => t.templateKey === item.templateKey);
                   const rawType = typeof tItem?.metadata?.type === 'string' ? tItem.metadata.type : undefined;
                   const typeVal = normalizeAccountType(rawType);
                   const natureVal = getAccountNature(typeVal);
                   data.type = typeVal;
                   data.nature = natureVal;
                   data.configurationStatus = 'complete';
               }
               transaction.create(ref, data);
            };

            for (const i of plan.accounts) createItem(i, 'financeAccounts');
            for (const i of plan.funds) createItem(i, 'financeFunds');
            for (const i of plan.categories) createItem(i, 'financeCategories');

            // 4. Config
            const configData = {
               financeEntityId,
               paymentSettings: {
                   enabledPaymentMethods: selection.paymentMethodCodes,
                   defaultIncomePaymentMethod: null,
                   defaultExpensePaymentMethod: null
               },
               bootstrap: {
                   status: 'ready',
                   templateId,
                   templateVersion: 1,
                   appliedAt: ts,
                   appliedBy: uid,
                   requestId
               },
               updatedAt: ts
            };

            if (settingsDoc.exists) {
               transaction.update(settingsRef, configData);
            } else {
               transaction.create(settingsRef, { ...configData, createdAt: ts });
            }

            // 5. Audit
            const auditRef = orgRef.collection('financeAuditLogs').doc(auditId);
            transaction.create(auditRef, {
               action: 'finance.bootstrap.applied',
               actorUid: uid,
               requestId,
               organizationId,
               financeEntityId,
               details: {
                   templateId,
                   templateVersion: 1,
                   totals: {
                       accountsAdopted: plan.accounts.filter((a: any) => a.action === 'adopt').length,
                       accountsCreated: plan.accounts.filter((a: any) => a.action === 'create').length,
                       fundsAdopted: plan.funds.filter((f: any) => f.action === 'adopt').length,
                       fundsCreated: plan.funds.filter((f: any) => f.action === 'create').length,
                       categoriesAdopted: plan.categories.filter((c: any) => c.action === 'adopt').length,
                       categoriesCreated: plan.categories.filter((c: any) => c.action === 'create').length
                   },
                   enabledPaymentMethods: selection.paymentMethodCodes
               },
               createdAt: ts
            });

            // 6. Idempotency & Verification Manifest
            const manifestDocuments: any[] = [];
            for (const lData of locksData) {
               if (lData.item.action === 'adopt' || lData.item.action === 'create') {
                  const docId = lData.expectedDocId;
                  const type = lData.item.entityType;
                  const action = lData.item.action;

                  const dataForHash: any = {
                      active: action === 'adopt' ? lData.item.active : true,
                      customized: action === 'adopt' ? true : false,
                      documentId: docId,
                      financeEntityId,
                      normalizedName: normalizeName(lData.item.name),
                      source: action === 'adopt' ? 'migration' : 'setup_template',
                      templateId,
                      templateKey: lData.item.templateKey || null,
                      templateVersion: lData.item.templateKey ? 1 : null
                  };

                  if (type === 'account') {
                      dataForHash.type = action === 'adopt' ? (lData.item.originalData?.type || 'checking') : 'checking';
                  } else if (type === 'fund') {
                      dataForHash.restricted = action === 'adopt' ? !!lData.item.originalData?.restricted : false;
                  } else if (type === 'category') {
                      dataForHash.kind = lData.item.kind;
                  }

                  const expectedStateHash = computeExpectedStateHash(normalizeExpectedBootstrapState(type as 'account' | 'fund' | 'category', dataForHash));

                  manifestDocuments.push({
                      entityType: type,
                      documentId: docId,
                      action,
                      lockId: lData.lockId,
                      expectedStateHash
                  });
               }
            }

            const idemData = {
               requestFingerprint,
               financeEntityId,
               requestId,
               status: 'completed',
               manifest: {
                   version: 1,
                   financeEntityId,
                   requestId,
                   auditId,
                   settingsDocumentId: `entity_${financeEntityId}`,
                   summary: {
                       adopted: summary.adopt,
                       created: summary.create,
                       skipped: summary.skip
                   },
                   documents: manifestDocuments
               },
               result: {
                   summary,
                   bootstrapStatus: 'ready'
               },
               createdAt: ts
            };
            transaction.create(idemRef, idemData);

            transactionResult = { replayed: false, result: idemData.result };
        });

        // Resolve response
        if (transactionResult.replayed) {
            return res.status(200).json({ changed: false, replayed: true, ...transactionResult.result });
        } else {
            return res.status(201).json({
                changed: true,
                replayed: false,
                financeEntityId,
                bootstrapStatus: 'ready',
                summary: transactionResult.result.summary,
                enabledPaymentMethods: selection.paymentMethodCodes
            });
        }

    } catch (err: any) {
        if (err.status) {
            return res.status(err.status).json({ code: err.code, error: err.error });
        }
        throw err;
    }

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities bootstrap apply error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
