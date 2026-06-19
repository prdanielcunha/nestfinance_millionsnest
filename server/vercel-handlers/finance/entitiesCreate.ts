import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { normalizeCnpj, isValidCnpj, getCnpjFormat } from '../../../shared/finance/taxId.js';
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
        taxId,
        legalName,
        tradeName,
        displayName,
        registration,
        registeredAddress,
        operationalAddress,
        operationalAddressSameAsRegistered,
        registryConfirmation
    } = req.body;

    if (!taxId || typeof taxId !== 'string') {
        return res.status(400).json({ error: 'INVALID_TAX_ID' });
    }

    const normalizedTaxId = normalizeCnpj(taxId);
    if (!isValidCnpj(normalizedTaxId)) {
        return res.status(400).json({ error: 'INVALID_TAX_ID' });
    }

    const cleanString = (val: any) => typeof val === 'string' && val.trim() ? val.replace(/\s+/g, ' ').trim() : null;
    const normalizeKey = (val: string) => val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const cleanLegalName = cleanString(legalName);
    const cleanDisplayName = cleanString(displayName);

    if (!cleanLegalName || !cleanDisplayName) {
        return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' });
    }

    const normalizedDisplayName = normalizeKey(cleanDisplayName);

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

    const orgRef = firestore.collection('organizations').doc(organizationId);
    
    // Create logical lock keys
    const taxIdHash = createHash('sha256').update(`financeEntity:taxId:${normalizedTaxId}`).digest('hex');
    const nameHash = createHash('sha256').update(`financeEntity:displayName:${normalizedDisplayName}`).digest('hex');
    
    const taxIdLockRef = orgRef.collection('financeUniqueKeys').doc(`uniq_${taxIdHash}`);
    const nameLockRef = orgRef.collection('financeUniqueKeys').doc(`uniq_${nameHash}`);

    const financeEntityId = `fent_${randomBytes(16).toString('hex')}`;
    const entityRef = orgRef.collection('financeEntities').doc(financeEntityId);
    
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    const taxIdFormat = getCnpjFormat(normalizedTaxId);
    let source = 'manual';
    let providerDataset = null;
    
    if (cleanString(registryConfirmation?.source) === 'brasilapi') {
      source = 'brasilapi';
      providerDataset = 'minha_receita';
    } else if (cleanString(registryConfirmation?.source) === 'cnpjws') {
      source = 'cnpjws';
      providerDataset = 'cnpjws_public';
    }

    try {
        await firestore.runTransaction(async (t) => {
            const taxIdLock = await t.get(taxIdLockRef);
            const nameLock = await t.get(nameLockRef);

            if (taxIdLock.exists || nameLock.exists) {
                throw new Error('FINANCE_ENTITY_ALREADY_EXISTS');
            }

            const formatReg = (reg: any) => {
                 if (!reg || typeof reg !== 'object') return null;
                 return {
                     status: cleanString(reg.status),
                     statusDate: cleanString(reg.statusDate),
                     openingDate: cleanString(reg.openingDate),
                     legalNatureCode: cleanString(reg.legalNatureCode),
                     legalNatureDescription: cleanString(reg.legalNatureDescription),
                     primaryActivityCode: cleanString(reg.primaryActivityCode),
                     primaryActivityDescription: cleanString(reg.primaryActivityDescription),
                 }
            };
            const cleanRegistration = formatReg(registration) || {
                     status: null,
                     statusDate: null,
                     openingDate: null,
                     legalNatureCode: null,
                     legalNatureDescription: null,
                     primaryActivityCode: null,
                     primaryActivityDescription: null,
            };

            const data = {
                id: financeEntityId,
                organizationId,
                taxIdType: 'CNPJ',
                taxId: normalizedTaxId,
                taxIdFormat,
                legalName: cleanLegalName,
                tradeName: cleanString(tradeName),
                displayName: cleanDisplayName,
                normalizedDisplayName,
                registration: cleanRegistration,
                registeredAddress: cleanRegisteredAddress,
                operationalAddress: cleanOperationalAddress,
                operationalAddressSameAsRegistered: isSameAsRegistered,
                logoPath: null,
                registrySource: {
                    provider: source,
                    providerDataset,
                    queriedAt: cleanString(registryConfirmation?.queriedAt) ? new Date(cleanString(registryConfirmation?.queriedAt)!) : null,
                    confirmedAt: FieldValue.serverTimestamp(),
                    confirmedBy: uid,
                },
                active: true,
                createdAt: FieldValue.serverTimestamp(),
                createdBy: uid,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: uid,
                schemaVersion: 1
            };

            t.create(entityRef, data);
            
            t.create(taxIdLockRef, { 
                entityId: financeEntityId, 
                keyType: 'financeEntity:taxId', 
                value: normalizedTaxId,
                createdAt: FieldValue.serverTimestamp()
            });

            t.create(nameLockRef, { 
                entityId: financeEntityId, 
                keyType: 'financeEntity:displayName', 
                value: normalizedDisplayName,
                createdAt: FieldValue.serverTimestamp()
            });
            
            t.create(auditRef, {
                organizationId,
                actorUid: uid,
                action: 'finance.entity.created',
                entityType: 'financeEntity',
                entityId: financeEntityId,
                requestId,
                schemaVersion: 1,
                metadata: {
                  source,
                  taxIdFormat,
                },
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        return res.status(200).json({ financeEntityId });

    } catch (txError: any) {
        if (txError.message === 'FINANCE_ENTITY_ALREADY_EXISTS') {
            return res.status(409).json({ error: 'FINANCE_ENTITY_ALREADY_EXISTS' });
        }
        throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities Create error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
