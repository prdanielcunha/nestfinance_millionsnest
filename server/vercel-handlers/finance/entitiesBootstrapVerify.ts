import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { canManageFinanceBootstrap } from './bootstrapAvailabilityHelper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 8192) {
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

    const { financeEntityId, idempotencyKey } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string' || !idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const authorization = await canManageFinanceBootstrap(uid, organizationId, financeEntityId);
    if (!authorization.canApply) {
      return res.status(403).json({ error: 'FORBIDDEN', reason: authorization.reason });
    }

    // Explicitly reject unsupported fields that might be passed incorrectly
    const invalidFields = ['organizationId', 'uid', 'roles', 'requestId', 'auditId', 'manifest', 'document IDs', 'lock IDs', 'paths'];
    for (const f of invalidFields) {
      if (f in req.body) return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const { isValidFinanceEntityId } = await import('../../../api/_lib/financeIdentity.js');
    if (!isValidFinanceEntityId(financeEntityId)) {
      return res.status(400).json({ error: 'INVALID_FINANCE_ENTITY_ID' });
    }

    const { computeExpectedStateHash, normalizeName } = await import('../../../shared/finance/bootstrapHelpers.js');
    const { createHash } = await import('crypto');

    const idempotencyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const idempotencyDocumentId = `idem_${idempotencyHash}`;

    const orgRef = firestore.collection('organizations').doc(organizationId);

    // 1. Ler documento de idempotência
    const idemRef = orgRef.collection('financeIdempotency').doc(idempotencyDocumentId);
    const idemDoc = await idemRef.get();

    if (!idemDoc.exists) {
      return res.status(404).json({ error: 'BOOTSTRAP_OPERATION_NOT_FOUND' });
    }

    const idemData = idemDoc.data();

    // 2. Confirmar status
    if (idemData?.status !== 'completed') {
      return res.status(409).json({ error: 'BOOTSTRAP_OPERATION_INCOMPLETE' });
    }

    // 3. Confirmar que pertence ao financeEntityId
    if (idemData?.financeEntityId !== financeEntityId) {
      return res.status(400).json({ error: 'ENTITY_MISMATCH' });
    }

    // 4. Validar a presença do manifesto
    const manifest = idemData?.manifest;
    if (!manifest || manifest.version !== 1) {
      return res.status(409).json({ error: 'VERIFICATION_MANIFEST_MISSING' });
    }

    let verifiedDocuments = 0;
    let verifiedLocks = 0;
    let settingsVerified = false;
    let auditLogVerified = false;
    let idempotencyVerified = true;
    const issues: any[] = [];

    // Summary validation
    if (manifest.summary.adopted + manifest.summary.created !== manifest.documents.length) {
      idempotencyVerified = false;
      issues.push({ code: 'MANIFEST_SUMMARY_MISMATCH', area: 'idempotency', message: 'Manifest summary counts do not match document lists' });
    }

    // 5. Ler diretamente os documentos indicados no manifesto
    // We group reads but can just fetch them via Promise.all
    const docRefs = manifest.documents.map((d: any) => {
       const collection = d.entityType === 'account' ? 'financeAccounts' : (d.entityType === 'fund' ? 'financeFunds' : 'financeCategories');
       return orgRef.collection(collection).doc(d.documentId);
    });
    
    // 6. Ler diretamente os locks indicados
    const lockRefs = manifest.documents.map((d: any) => {
       return orgRef.collection('financeUniqueKeys').doc(d.lockId);
    });

    const [docSnaps, lockSnaps, settingsSnap, auditSnap] = await Promise.all([
       Promise.all(docRefs.map((r: any) => r.get())),
       Promise.all(lockRefs.map((r: any) => r.get())),
       orgRef.collection('financeSettings').doc(manifest.settingsDocumentId).get(),
       orgRef.collection('financeAuditLogs').doc(manifest.auditId).get()
    ]);

    for (let i = 0; i < manifest.documents.length; i++) {
        const d = manifest.documents[i];
        const docSnap = docSnaps[i];
        const lockSnap = lockSnaps[i];

        if (!docSnap.exists) {
            issues.push({ code: 'DOCUMENT_MISSING', area: 'document', message: `Missing document for type ${d.entityType}`, documentId: d.documentId });
        } else {
            const data = docSnap.data();
            if (data.financeEntityId !== financeEntityId) {
                issues.push({ code: 'DOCUMENT_ENTITY_MISMATCH', area: 'document', message: 'Document does not belong to financeEntityId', documentId: d.documentId });
            } else {
                const { normalizePersistedBootstrapState, computeExpectedStateHash } = await import('../../../shared/finance/bootstrapHelpers.js');
                const actualHash = computeExpectedStateHash(normalizePersistedBootstrapState(d.entityType, d.documentId, data));
                if (actualHash !== d.expectedStateHash) {
                    issues.push({ 
                        code: 'DOCUMENT_HASH_MISMATCH', 
                        area: 'document', 
                        message: `State hash mismatch for ${d.entityType}`,
                        documentId: d.documentId,
                        expectedStateHash: d.expectedStateHash,
                        actualStateHash: actualHash
                    });
                } else {
                    verifiedDocuments++;
                }
            }
        }

        if (!lockSnap.exists) {
            issues.push({ code: 'LOCK_MISSING', area: 'lock', message: `Missing lock for document type ${d.entityType}`, lockId: d.lockId });
        } else {
            const lData = lockSnap.data();
            if (lData.documentId !== d.documentId) {
                issues.push({ code: 'LOCK_DOCUMENT_MISMATCH', area: 'lock', message: 'Lock points to incorrect document', lockId: d.lockId });
            } else {
                verifiedLocks++;
            }
        }
    }

    // First, verify audit log to extract expected state
    let expectedPaymentMethods: string[] = [];
    if (!auditSnap.exists) {
        issues.push({ code: 'AUDIT_MISSING', area: 'audit', message: 'Audit log missing' });
    } else {
        const aData = auditSnap.data();
        if (aData.action !== 'finance.bootstrap.applied') {
            issues.push({ code: 'AUDIT_ACTION_MISMATCH', area: 'audit', message: 'Audit action incorrect' });
        } else if (aData.financeEntityId !== financeEntityId || aData.requestId !== manifest.requestId) {
            issues.push({ code: 'AUDIT_RECORD_MISMATCH', area: 'audit', message: 'Audit record reference incorrect' });
        } else {
            auditLogVerified = true;
            expectedPaymentMethods = Array.isArray(aData.details?.enabledPaymentMethods) ? aData.details.enabledPaymentMethods : [];
            expectedPaymentMethods.sort();
        }
    }

    if (!settingsSnap.exists) {
        issues.push({ code: 'SETTINGS_MISSING', area: 'settings', message: 'Settings document missing' });
    } else {
        const sData = settingsSnap.data();
        if (sData.financeEntityId !== financeEntityId) {
            issues.push({ code: 'SETTINGS_ENTITY_MISMATCH', area: 'settings', message: 'Settings financeEntityId mismatch' });
        } else if (sData.bootstrap?.status !== 'ready') {
            issues.push({ code: 'SETTINGS_NOT_READY', area: 'settings', message: 'Settings bootstrap status is not ready' });
        } else {
            const pmCodes = sData.paymentSettings?.enabledPaymentMethods;
            if (!Array.isArray(pmCodes)) {
                issues.push({ code: 'SETTINGS_INVALID_METHODS', area: 'settings', message: 'Settings methods invalid' });
            } else {
                const { PAYMENT_METHODS } = await import('../../../shared/finance/paymentMethods.js');
                const validCodes = PAYMENT_METHODS.map((m: any) => m.code);
                const hasInvalid = pmCodes.some((code: string) => !validCodes.includes(code));
                
                const sortedActual = [...pmCodes].sort();
                const methodsMatch = JSON.stringify(sortedActual) === JSON.stringify(expectedPaymentMethods);

                if (hasInvalid) {
                     issues.push({ code: 'SETTINGS_UNKNOWN_METHOD', area: 'settings', message: 'Settings has unknown payment method code' });
                } else if (!methodsMatch) {
                     issues.push({ code: 'SETTINGS_METHODS_MISMATCH', area: 'settings', message: 'Settings payment methods do not match expected manifest array' });
                } else {
                     settingsVerified = true;
                }
            }
        }
    }

    // Verification of standard/default accounts
    const accountsVerifySnap = await orgRef.collection('financeAccounts').where('financeEntityId', '==', financeEntityId).get();
    const { CANONICAL_ACCOUNT_TEMPLATES, getAccountNature } = await import('../../../shared/finance/smartLogic.js');
    
    for (const doc of accountsVerifySnap.docs) {
       const acc = doc.data();
       if (acc.source === 'setup_template' && !acc.templateKey) {
          issues.push({
             code: 'ACCOUNT_TEMPLATE_KEY_MISSING',
             area: 'account',
             message: 'Conta padrão sem templateKey esperado',
             accountId: doc.id
          });
       }
       if (acc.templateKey) {
          const expectedKey = acc.templateKey;
          const canon = CANONICAL_ACCOUNT_TEMPLATES[expectedKey];
          
          if (!canon) {
             issues.push({ 
                code: 'ACCOUNT_TEMPLATE_UNRECOGNIZED', 
                area: 'account', 
                message: 'Conta padrão com templateKey não reconhecido', 
                accountId: doc.id 
             });
             continue;
          }

          if (!acc.type) {
             issues.push({ 
                code: 'ACCOUNT_TYPE_MISSING', 
                area: 'account', 
                message: 'Conta padrão sem tipo', 
                accountId: doc.id 
             });
          }
          if (!acc.nature) {
             issues.push({ 
                code: 'ACCOUNT_NATURE_MISSING', 
                area: 'account', 
                message: 'Conta padrão sem natureza', 
                accountId: doc.id 
             });
          }
          if (acc.type && acc.nature) {
             const expectedNature = getAccountNature(acc.type);
             if (acc.nature !== expectedNature) {
                issues.push({ 
                   code: 'ACCOUNT_NATURE_INCOMPATIBLE', 
                   area: 'account', 
                   message: 'Conta padrão com natureza incompatível', 
                   accountId: doc.id 
                });
             }
          }
          if (acc.nature === 'clearing') {
             issues.push({ 
                code: 'ACCOUNT_NATURE_CLEARING', 
                area: 'account', 
                message: 'Conta padrão marcada como clearing sem justificativa', 
                accountId: doc.id 
             });
          }
       }
    }

    const verified = idempotencyVerified && settingsVerified && auditLogVerified && (verifiedDocuments === manifest.documents.length) && (verifiedLocks === manifest.documents.length) && issues.length === 0;

    if (!verified) {
         console.warn(JSON.stringify({
              msg: '[BOOTSTRAP_VERIFY_MISMATCH]',
              financeEntityId,
              idempotencyKeyPrefix: idempotencyKey.substring(0, 8),
              stage: 'verify',
              expectedCounts: {
                  documents: manifest.documents.length,
                  locks: manifest.documents.length
              },
              actualCounts: {
                  documents: verifiedDocuments,
                  locks: verifiedLocks
              },
              issueCodes: issues.map(i => i.code)
         }));
    }

    return res.status(200).json({
        verified,
        status: verified ? 'passed' : 'failed',
        summary: {
           expectedDocuments: manifest.documents.length,
           verifiedDocuments,
           expectedLocks: manifest.documents.length,
           verifiedLocks,
           settingsVerified,
           auditLogVerified,
           idempotencyVerified
        },
        issues
    });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities bootstrap verify error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
