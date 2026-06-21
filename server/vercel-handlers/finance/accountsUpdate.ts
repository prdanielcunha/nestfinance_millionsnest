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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
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

    const { accountId, name, institutionName, accountLast4, financeEntityId } = req.body;

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
        // reject control chars
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
        const accountDoc = await t.get(accountRef);
        if (!accountDoc.exists) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }

        const accountData = accountDoc.data()!;
        if (accountData.organizationId !== organizationId) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }
        if (accountData.financeEntityId !== financeEntityId) {
          throw new Error('FINANCE_ENTITY_MISMATCH');
        }

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

        // No-op operation does not write locks or audit logs
        if (!isNameChanged && !isVisualNameChanged && !isInstitutionNameChanged && !isAccountLast4Changed) {
          return {
            changed: false,
            account: {
              id: accountId,
              name: currentName,
              type: accountData.type,
              institutionName: currentInstitutionName || undefined,
              accountLast4: currentAccountLast4 || undefined,
              currency: accountData.currency,
              active: accountData.active
            }
          };
        }

        let newUniqueDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

        if (isNameChanged) {
          newUniqueDoc = await t.get(uniqueKeysCol.doc(newUniqueKeyId));
          
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
          accountUpdateData.institutionName = parsedInstitutionName;
          if (parsedInstitutionName === null) {
            accountUpdateData.institutionName = FieldValue.delete();
          }
        }

        if (isAccountLast4Changed) {
          accountUpdateData.accountLast4 = parsedAccountLast4;
          if (parsedAccountLast4 === null) {
            accountUpdateData.accountLast4 = FieldValue.delete();
          }
        }

        t.update(accountRef, accountUpdateData);

        const auditChanges: any = {};
        if (isNameChanged || isVisualNameChanged) {
          auditChanges.name = {
            from: currentName,
            to: trimmedName
          };
        }
        if (isInstitutionNameChanged) {
          auditChanges.institutionName = {
            from: currentInstitutionName,
            to: parsedInstitutionName
          };
        }
        if (isAccountLast4Changed) {
          auditChanges.accountLast4 = {
            fromPresent: currentAccountLast4 !== null,
            toPresent: parsedAccountLast4 !== null
          };
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

        return {
          changed: true,
          account: {
            id: accountId,
            name: trimmedName,
            type: accountData.type,
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
      throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
