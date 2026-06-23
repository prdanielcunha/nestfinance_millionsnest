import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { 
  normalizeFinanceName, 
  buildUniqueKeyLogicName, 
  generateUniqueKeyId,
  isValidAccountId
} from '../../../api/_lib/financeIdentity.js';
import { requireScopedFinanceAccount } from './accessHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
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

    // Must be global access or have finance.accounts.manage
    const hasManageAccess = sessionList.isGlobalAccess === true || sessionList.capabilities?.includes('finance.accounts.manage');
    if (!hasManageAccess) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const { 
      accountId, name, institutionName, accountLast4, financeEntityId,
      type, nature, configurationStatus, operationalPurpose, supportedInstruments, availabilityBehavior
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED' });
    }

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID' });
    }

    if (!isValidAccountId(accountId)) {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID' });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const trimmedName = name.trim().replace(/\s+/g, ' ');
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({ error: 'INVALID_NAME_LENGTH' });
    }

    let normalizedName: string;
    try {
      normalizedName = normalizeFinanceName(trimmedName);
    } catch {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    let parsedInstitutionName: string | null = null;
    if (institutionName !== undefined && institutionName !== null) {
      if (typeof institutionName !== 'string') {
        return res.status(400).json({ error: 'INVALID_INSTITUTION_NAME' });
      }
      const trimmedInst = institutionName.trim().replace(/\s+/g, ' ');
      if (trimmedInst !== '') {
        if (trimmedInst.length < 2 || trimmedInst.length > 80) {
          return res.status(400).json({ error: 'INVALID_INSTITUTION_NAME_LENGTH' });
        }
        if (/[\x00-\x1F\x7F]/.test(trimmedInst)) {
          return res.status(400).json({ error: 'INVALID_INSTITUTION_NAME' });
        }
        parsedInstitutionName = trimmedInst;
      }
    }

    let parsedAccountLast4: string | null = null;
    if (accountLast4 !== undefined && accountLast4 !== null) {
      if (typeof accountLast4 !== 'string') {
        return res.status(400).json({ error: 'INVALID_ACCOUNT_LAST4' });
      }
      if (accountLast4 !== '') {
        if (!/^\d{4}$/.test(accountLast4)) {
          return res.status(400).json({ error: 'INVALID_ACCOUNT_LAST4_FORMAT' });
        }
        parsedAccountLast4 = accountLast4;
      }
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const uniqueKeysCol = orgRef.collection('financeUniqueKeys');
    const accountsCol = orgRef.collection('financeAccounts');
    const accountRef = accountsCol.doc(accountId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    try {
      const result = await firestore.runTransaction(async (t) => {
        const { accountData } = await requireScopedFinanceAccount({
          db: firestore,
          uid,
          organizationId,
          financeEntityId,
          accountId,
          sessionGranted: sessionList.granted,
          transaction: t
        });

        const currentNormalizedName = accountData.normalizedName;
        const currentName = accountData.name;
        const currentInstitutionName = accountData.institutionName || null;
        const currentAccountLast4 = accountData.accountLast4 || null;

        const currentLogicalKey = `${financeEntityId}:${buildUniqueKeyLogicName('account', currentNormalizedName)}`;
        const currentUniqueKeyId = generateUniqueKeyId(currentLogicalKey);
        
        const newLogicalKey = `${financeEntityId}:${buildUniqueKeyLogicName('account', normalizedName)}`;
        const newUniqueKeyId = generateUniqueKeyId(newLogicalKey);

        const currentUniqueDoc = await t.get(uniqueKeysCol.doc(currentUniqueKeyId));

        const isNameChanged = currentNormalizedName !== normalizedName;
        const isVisualNameChanged = currentName !== trimmedName;
        const isInstitutionNameChanged = currentInstitutionName !== parsedInstitutionName;
        const isAccountLast4Changed = currentAccountLast4 !== parsedAccountLast4;
        
        const isTypeChanged = type !== undefined && type !== accountData.type;
        const isNatureChanged = nature !== undefined && nature !== accountData.nature;
        const isConfigStatusChanged = configurationStatus !== undefined && configurationStatus !== accountData.configurationStatus;
        const isPurposeChanged = operationalPurpose !== undefined && operationalPurpose !== accountData.operationalPurpose;
        const isInstrumentsChanged = supportedInstruments !== undefined && JSON.stringify(supportedInstruments) !== JSON.stringify(accountData.supportedInstruments);
        const isBehaviorChanged = availabilityBehavior !== undefined && availabilityBehavior !== accountData.availabilityBehavior;

        // Check if anything actually changed
        if (
          !isNameChanged && !isVisualNameChanged && !isInstitutionNameChanged && !isAccountLast4Changed &&
          !isTypeChanged && !isNatureChanged && !isConfigStatusChanged && !isPurposeChanged && !isInstrumentsChanged && !isBehaviorChanged
        ) {
          return {
            changed: false,
            account: {
              id: accountId,
              name: currentName,
              type: accountData.type,
              nature: accountData.nature,
              configurationStatus: accountData.configurationStatus,
              institutionName: currentInstitutionName || undefined,
              accountLast4: currentAccountLast4 || undefined,
              currency: accountData.currency,
              active: accountData.active
            }
          };
        }

        if (isNameChanged) {
          const newUniqueDoc = await t.get(uniqueKeysCol.doc(newUniqueKeyId));
          if (newUniqueDoc.exists) {
            throw new Error('ACCOUNT_ALREADY_EXISTS');
          }

          const legacySnap = await t.get(accountsCol.where('financeEntityId', '==', financeEntityId).where('normalizedName', '==', normalizedName));
          const hasLegacy = legacySnap.docs.some(doc => doc.id !== accountId);
          if (hasLegacy) {
            throw new Error('ACCOUNT_ALREADY_EXISTS');
          }
        }

        if (isNameChanged) {
          const newUniqueKeyData = {
            organizationId,
            financeEntityId,
            entityType: 'financeAccount',
            entityId: accountId,
            scope: 'account',
            normalizedName,
            status: 'reserved',
            schemaVersion: 1,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          };
          t.create(uniqueKeysCol.doc(newUniqueKeyId), newUniqueKeyData);
        }

        if (!currentUniqueDoc.exists) {
          const currentUniqueKeyData = {
            organizationId,
            financeEntityId,
            entityType: 'financeAccount',
            entityId: accountId,
            scope: 'account',
            normalizedName: currentNormalizedName,
            status: 'reserved',
            schemaVersion: 1,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          };
          t.create(uniqueKeysCol.doc(currentUniqueKeyId), currentUniqueKeyData);
        }

        const accountUpdateData: any = {
          name: trimmedName,
          normalizedName,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        };

        if (isInstitutionNameChanged) {
          accountUpdateData.institutionName = parsedInstitutionName === null ? FieldValue.delete() : parsedInstitutionName;
        }

        if (isAccountLast4Changed) {
          accountUpdateData.accountLast4 = parsedAccountLast4 === null ? FieldValue.delete() : parsedAccountLast4;
        }

        // Inline metadata & custom account properties update
        if (type !== undefined) {
          const { normalizeAccountType, getAccountNature } = await import('../../../shared/finance/smartLogic.js');
          const normalizedType = normalizeAccountType(type);
          accountUpdateData.type = normalizedType;

          if (normalizedType === 'other') {
            const finalNature = nature || accountData.nature || 'clearing';
            accountUpdateData.nature = finalNature;

            // Strict Validation rules if we are saving other/custom with configuration complete
            if (configurationStatus === 'complete' || accountData.configurationStatus === 'complete') {
              const checkPurpose = operationalPurpose !== undefined ? operationalPurpose : accountData.operationalPurpose;
              const checkInstruments = supportedInstruments !== undefined ? supportedInstruments : accountData.supportedInstruments;
              const checkBehavior = availabilityBehavior !== undefined ? availabilityBehavior : accountData.availabilityBehavior;

              if (!['asset', 'liability', 'receivable', 'clearing'].includes(finalNature)) {
                throw new Error('INVALID_NATURE_FOR_CUSTOM_ACCOUNT');
              }
              if (!checkPurpose || typeof checkPurpose !== 'string' || checkPurpose.trim().length < 5) {
                throw new Error('INVALID_OPERATIONAL_PURPOSE');
              }
              if (!Array.isArray(checkInstruments) || checkInstruments.length === 0 || checkInstruments.some(i => typeof i !== 'string')) {
                throw new Error('INVALID_SUPPORTED_INSTRUMENTS');
              }
              const validBehaviors = ['immediate', 'delayed', 'restricted', 'clearing'];
              if (!checkBehavior || !validBehaviors.includes(checkBehavior)) {
                throw new Error('INVALID_AVAILABILITY_BEHAVIOR');
              }
            }
          } else {
            accountUpdateData.nature = getAccountNature(normalizedType);
          }
        }

        if (nature !== undefined && type === 'other') {
          if (!['asset', 'liability', 'receivable', 'clearing'].includes(nature)) {
            throw new Error('INVALID_NATURE_FOR_CUSTOM_ACCOUNT');
          }
          accountUpdateData.nature = nature;
        }

        if (configurationStatus !== undefined) {
          accountUpdateData.configurationStatus = configurationStatus;
        }

        if (operationalPurpose !== undefined) {
          accountUpdateData.operationalPurpose = operationalPurpose.trim();
        }

        if (supportedInstruments !== undefined) {
          accountUpdateData.supportedInstruments = supportedInstruments;
        }

        if (availabilityBehavior !== undefined) {
          accountUpdateData.availabilityBehavior = availabilityBehavior;
        }

        t.update(accountRef, accountUpdateData);

        const auditChanges: any = {};
        if (isNameChanged || isVisualNameChanged) {
          auditChanges.name = { from: currentName, to: trimmedName };
        }
        if (isInstitutionNameChanged) {
          auditChanges.institutionName = { from: currentInstitutionName, to: parsedInstitutionName };
        }
        if (isAccountLast4Changed) {
          auditChanges.accountLast4 = { fromPresent: currentAccountLast4 !== null, toPresent: parsedAccountLast4 !== null };
        }
        if (isTypeChanged) {
          auditChanges.type = { from: accountData.type, to: accountUpdateData.type };
        }
        if (isNatureChanged) {
          auditChanges.nature = { from: accountData.nature, to: accountUpdateData.nature };
        }
        if (isConfigStatusChanged) {
          auditChanges.configurationStatus = { from: accountData.configurationStatus, to: configurationStatus };
        }

        const auditData = {
          organizationId,
          actorUid: uid,
          action: 'finance.account.updated',
          entityType: 'financeAccount',
          entityId: accountId,
          requestId,
          schemaVersion: 1,
          changes: auditChanges,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(auditRef, auditData);

        const finalAccountType = accountUpdateData.type || accountData.type;
        return {
          changed: true,
          account: {
            id: accountId,
            name: trimmedName,
            type: finalAccountType,
            nature: accountUpdateData.nature || accountData.nature,
            configurationStatus: accountUpdateData.configurationStatus || accountData.configurationStatus,
            institutionName: parsedInstitutionName || undefined,
            accountLast4: parsedAccountLast4 || undefined,
            currency: accountData.currency,
            active: accountData.active
          }
        };
      });

      return res.status(200).json(result);
    } catch (txError: any) {
      if (txError.message === 'ACCOUNT_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'ACCOUNT_ALREADY_EXISTS' });
      }
      if (txError.message === 'ACCOUNT_NOT_FOUND') {
        return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
      }
      if (txError.message === 'FINANCE_ENTITY_MISMATCH') {
        return res.status(403).json({ error: 'FINANCE_ENTITY_MISMATCH' });
      }
      if (
        txError.message === 'INVALID_NATURE_FOR_CUSTOM_ACCOUNT' ||
        txError.message === 'INVALID_OPERATIONAL_PURPOSE' ||
        txError.message === 'INVALID_SUPPORTED_INSTRUMENTS' ||
        txError.message === 'INVALID_AVAILABILITY_BEHAVIOR'
      ) {
        return res.status(400).json({ error: txError.message });
      }
      throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Update account error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
