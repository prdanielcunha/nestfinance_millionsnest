import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.NESTFINANCE_ENTITIES_WRITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'ENTITIES_WRITE_DISABLED' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
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
    if (err.message === 'MISSING_FIREBASE_CREDENTIALS') {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  const { auth, firestore } = admin;

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);

    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const {
        financeEntityId,
        expectedUpdatedAt,
        displayName,
        legalName,
        tradeName,
        registeredAddress,
        operationalAddress,
        operationalAddressSameAsRegistered,
        confirmClearRegisteredAddress,
        confirmClearOperationalAddress
    } = req.body;

    const extraKeys = Object.keys(req.body).filter(k => 
      !['financeEntityId', 'expectedUpdatedAt', 'displayName', 'legalName', 'tradeName', 'registeredAddress', 'operationalAddress', 'operationalAddressSameAsRegistered', 'confirmClearRegisteredAddress', 'confirmClearOperationalAddress'].includes(k)
    );
    if (extraKeys.length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES' });
    }

    if (!financeEntityId || typeof financeEntityId !== 'string' || !financeEntityId.startsWith('fent_') || financeEntityId.length !== 37) {
        return res.status(400).json({ error: 'INVALID_ENTITY_ID' });
    }

    if (!expectedUpdatedAt || typeof expectedUpdatedAt !== 'string') {
        return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' });
    }

    if (confirmClearRegisteredAddress !== undefined && typeof confirmClearRegisteredAddress !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }
    
    if (confirmClearOperationalAddress !== undefined && typeof confirmClearOperationalAddress !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const cleanString = (val: any) => typeof val === 'string' && val.trim() ? val.replace(/\s+/g, ' ').trim() : null;
    const normalizeKey = (val: string) => val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const cleanLegalName = cleanString(legalName);
    const cleanDisplayName = cleanString(displayName);

    if (!cleanLegalName || !cleanDisplayName) {
        return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' });
    }

    const normalizedDisplayName = normalizeKey(cleanDisplayName);
    if (!normalizedDisplayName) {
        return res.status(400).json({ error: 'INVALID_DISPLAY_NAME' });
    }

    const formatAddress = (addr: any) => {
        if (!addr || typeof addr !== 'object') return null;
        return {
            postalCode: cleanString(addr.postalCode),
            street: cleanString(addr.street),
            number: cleanString(addr.number),
            complement: cleanString(addr.complement),
            neighborhood: cleanString(addr.neighborhood),
            city: cleanString(addr.city),
            state: cleanString(addr.state)?.toUpperCase() || null,
        };
    };

    const cleanRegisteredAddress = formatAddress(registeredAddress) || {
        postalCode: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null
    };

    const isSameAsRegistered = operationalAddressSameAsRegistered === true;
    const cleanOperationalAddress = isSameAsRegistered 
      ? cleanRegisteredAddress
      : formatAddress(operationalAddress) || {
        postalCode: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null
    };
    
    const cleanTradeName = cleanString(tradeName);

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const entityRef = orgRef.collection('financeEntities').doc(financeEntityId);
    const newNameHash = createHash('sha256').update(`financeEntity:displayName:${normalizedDisplayName}`).digest('hex');
    const newNameLockRef = orgRef.collection('financeUniqueKeys').doc(`uniq_${newNameHash}`);
    
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');
    
    let isNoOp = false;
    let finalEntityData: any = null;

    try {
        await firestore.runTransaction(async (t) => {
            const entityDoc = await t.get(entityRef);
            if (!entityDoc.exists) {
                throw new Error('NOT_FOUND');
            }

            const currentData = entityDoc.data()!;
            
            let currentUpdatedAt = '';
            if (currentData.updatedAt) {
                 currentUpdatedAt = currentData.updatedAt.toDate().toISOString();
            } else if (currentData.createdAt) {
                 currentUpdatedAt = currentData.createdAt.toDate().toISOString();
            }

            if (currentUpdatedAt && expectedUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
                 throw new Error('FINANCE_ENTITY_VERSION_CONFLICT');
            }

            // Check for No-Op
            const isAddressEqual = (a: any, b: any) => {
                 return a?.postalCode === b?.postalCode &&
                        a?.street === b?.street &&
                        a?.number === b?.number &&
                        a?.complement === b?.complement &&
                        a?.neighborhood === b?.neighborhood &&
                        a?.city === b?.city &&
                        a?.state === b?.state;
            };

            const displayNameChanged = currentData.displayName !== cleanDisplayName;
            const normalizedDisplayNameChanged = currentData.normalizedDisplayName !== normalizedDisplayName;
            const legalNameChanged = currentData.legalName !== cleanLegalName;
            const tradeNameChanged = (currentData.tradeName || null) !== (cleanTradeName || null);
            const registeredAddressChanged = !isAddressEqual(currentData.registeredAddress, cleanRegisteredAddress);
            const operationalAddressChanged = !isAddressEqual(currentData.operationalAddress, cleanOperationalAddress);
            const isSameAsRegisteredChanged = currentData.operationalAddressSameAsRegistered !== isSameAsRegistered;

            const isEmptyAddress = (addr: any) => {
                return !addr?.postalCode && !addr?.street && !addr?.number && !addr?.complement && !addr?.neighborhood && !addr?.city && !addr?.state;
            };

            const isCurrentRegEmpty = isEmptyAddress(currentData.registeredAddress);
            const isNewRegEmpty = isEmptyAddress(cleanRegisteredAddress);
            if (!isCurrentRegEmpty && isNewRegEmpty && !confirmClearRegisteredAddress) {
                throw new Error('ADDRESS_CLEAR_CONFIRMATION_REQUIRED');
            }

            const isCurrentOpEmpty = isEmptyAddress(currentData.operationalAddress);
            const isNewOpEmpty = isEmptyAddress(cleanOperationalAddress);
            if (!isCurrentOpEmpty && isNewOpEmpty && !confirmClearOperationalAddress && !isSameAsRegistered) {
                throw new Error('ADDRESS_CLEAR_CONFIRMATION_REQUIRED');
            }

            if (!displayNameChanged && !normalizedDisplayNameChanged && !legalNameChanged && !tradeNameChanged && !registeredAddressChanged && !operationalAddressChanged && !isSameAsRegisteredChanged) {
                isNoOp = true;
                finalEntityData = currentData;
                return;
            }

            if (normalizedDisplayNameChanged) {
                const newNameLock = await t.get(newNameLockRef);
                if (newNameLock.exists && newNameLock.data()?.entityId !== financeEntityId) {
                    throw new Error('FINANCE_ENTITY_ALREADY_EXISTS');
                }
            }

            let updatePayload: any = {
                displayName: cleanDisplayName,
                normalizedDisplayName: normalizedDisplayName,
                legalName: cleanLegalName,
                tradeName: cleanTradeName,
                registeredAddress: cleanRegisteredAddress,
                operationalAddress: cleanOperationalAddress,
                operationalAddressSameAsRegistered: isSameAsRegistered,
                manualRevision: {
                     lastRevisedAt: FieldValue.serverTimestamp(),
                     lastRevisedBy: uid
                },
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: uid
            };

            if (normalizedDisplayNameChanged) {
                t.create(newNameLockRef, { 
                    entityId: financeEntityId, 
                    keyType: 'financeEntity:displayName', 
                    value: normalizedDisplayName,
                    createdAt: FieldValue.serverTimestamp()
                });
            }

            t.update(entityRef, updatePayload);
            
            const getChangedFields = (a: any, b: any) => {
                const changed = [];
                for (const key of ['postalCode', 'street', 'number', 'complement', 'neighborhood', 'city', 'state']) {
                    if (a?.[key] !== b?.[key]) changed.push(key);
                }
                return changed;
            };

            const auditChanges: any = {};
            if (displayNameChanged) {
                 auditChanges.displayName = { from: currentData.displayName, to: cleanDisplayName };
            }
            if (legalNameChanged) {
                 auditChanges.legalNameChanged = true;
            }
            if (tradeNameChanged) {
                 auditChanges.tradeNameChanged = true;
            }
            if (registeredAddressChanged) {
                 if (isNewRegEmpty && !isCurrentRegEmpty) {
                     auditChanges.registeredAddressCleared = true;
                 } else {
                     auditChanges.registeredAddressChangedFields = getChangedFields(currentData.registeredAddress, cleanRegisteredAddress);
                 }
            }
            if (operationalAddressChanged) {
                 if (isNewOpEmpty && !isCurrentOpEmpty && !isSameAsRegistered) {
                     auditChanges.operationalAddressCleared = true;
                 } else {
                     auditChanges.operationalAddressChangedFields = getChangedFields(currentData.operationalAddress, cleanOperationalAddress);
                 }
            }
            if (isSameAsRegisteredChanged) {
                 auditChanges.operationalAddressSameAsRegistered = { from: currentData.operationalAddressSameAsRegistered, to: isSameAsRegistered };
            }

            t.create(auditRef, {
                organizationId,
                actorUid: uid,
                action: 'finance.entity.updated',
                entityType: 'financeEntity',
                entityId: financeEntityId,
                requestId,
                schemaVersion: 1,
                changes: auditChanges,
                createdAt: FieldValue.serverTimestamp(),
            });
            
            finalEntityData = {
                 ...currentData,
                 displayName: cleanDisplayName,
                 legalName: cleanLegalName,
                 tradeName: cleanTradeName,
                 registeredAddress: cleanRegisteredAddress,
                 operationalAddress: cleanOperationalAddress,
                 active: currentData.active,
                 taxId: currentData.taxId,
                 registration: currentData.registration,
                 logoPath: currentData.logoPath
            };
        });

        if (!finalEntityData) {
             throw new Error('INTERNAL_SERVER_ERROR');
        }
        
        let taxIdFormatted = finalEntityData.taxId;
        if (finalEntityData.taxId && finalEntityData.taxId.length === 14) {
             taxIdFormatted = finalEntityData.taxId.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
        }

        return res.status(200).json({ 
            entity: {
                id: finalEntityData.id,
                taxIdFormatted: taxIdFormatted,
                legalName: finalEntityData.legalName,
                tradeName: finalEntityData.tradeName || null,
                displayName: finalEntityData.displayName,
                registrationStatus: finalEntityData.registration?.status || null,
                city: finalEntityData.operationalAddress?.city || null,
                state: finalEntityData.operationalAddress?.state || null,
                active: finalEntityData.active || false,
                hasLogo: !!finalEntityData.logoPath
            },
            changed: !isNoOp
        });

    } catch (txError: any) {
        if (txError.message === 'FINANCE_ENTITY_ALREADY_EXISTS') {
            return res.status(409).json({ error: 'FINANCE_ENTITY_ALREADY_EXISTS' });
        }
        if (txError.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'NOT_FOUND' });
        }
        throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities Update error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
