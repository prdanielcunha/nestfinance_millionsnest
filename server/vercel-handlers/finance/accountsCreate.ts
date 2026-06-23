import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { 
  normalizeFinanceName, 
  generateStableId, 
  buildUniqueKeyLogicName, 
  generateUniqueKeyId 
} from '../../../api/_lib/financeIdentity.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  }

  if (process.env.NESTFINANCE_ACCOUNTS_WRITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
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

    const bodyString = JSON.stringify(req.body);
    if (bodyString.length > 8192) {
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    }

    const { 
      name, type, institutionName, accountLast4, financeEntityId,
      nature, operationalPurpose, supportedInstruments, availabilityBehavior
    } = req.body;

    // Check for extra unknown properties
    const allowedKeys = [
      'name', 'type', 'institutionName', 'accountLast4', 'financeEntityId',
      'nature', 'operationalPurpose', 'supportedInstruments', 'availabilityBehavior'
    ];
    const extras = Object.keys(req.body).filter(k => !allowedKeys.includes(k));
    if (extras.length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES' });
    }

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED' });
    }

    const entityDoc = await firestore.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).get();
    if (!entityDoc.exists) {
      return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    }

    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const validTypes = [
      'cash', 'checking', 'bank_checking', 'savings', 'bank_savings', 
      'payment_account', 'digital_wallet', 'credit_card', 'petty_cash', 
      'reimbursement_payable', 'card_receivable', 'other'
    ];
    if (typeof type !== 'string' || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'INVALID_TYPE' });
    }

    if (institutionName !== undefined && institutionName !== null) {
      if (typeof institutionName !== 'string' || institutionName.length > 80) {
        return res.status(400).json({ error: 'INVALID_INSTITUTION_NAME' });
      }
    }

    if (accountLast4 !== undefined && accountLast4 !== null) {
      if (typeof accountLast4 !== 'string' || !/^\d{4}$/.test(accountLast4)) {
        return res.status(400).json({ error: 'INVALID_ACCOUNT_LAST4' });
      }
    }

    let normalizedName: string;
    try {
      normalizedName = normalizeFinanceName(trimmedName);
    } catch {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const logicalKey = `${financeEntityId}:${buildUniqueKeyLogicName('account', normalizedName)}`;
    const uniqueKeyId = generateUniqueKeyId(logicalKey);
    
    const orgRef = firestore.collection('organizations').doc(organizationId);
    const accountsCol = orgRef.collection('financeAccounts');
    
    const accountId = generateStableId('acc');
    const accountRef = accountsCol.doc(accountId);
    const uniqueKeyRef = orgRef.collection('financeUniqueKeys').doc(uniqueKeyId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    try {
      await firestore.runTransaction(async (t) => {
        const uniqueDoc = await t.get(uniqueKeyRef);
        if (uniqueDoc.exists) {
          throw new Error('ACCOUNT_ALREADY_EXISTS');
        }

        const legacySnap = await t.get(accountsCol.where('financeEntityId', '==', financeEntityId).where('normalizedName', '==', normalizedName).limit(1));
        if (!legacySnap.empty) {
          throw new Error('ACCOUNT_ALREADY_EXISTS');
        }

        const { normalizeAccountType, getAccountNature } = await import('../../../shared/finance/smartLogic.js');
        const normalizedType = normalizeAccountType(type);
        
        let finalNature;
        let isConfigured = 'complete';

        // Custom / Other Account Hardening rules (Section 3)
        if (normalizedType === 'other') {
          if (!nature || !['asset', 'liability', 'receivable', 'clearing'].includes(nature)) {
            throw new Error('INVALID_NATURE_FOR_CUSTOM_ACCOUNT');
          }
          finalNature = nature;

          // Require explicit operational details
          if (!operationalPurpose || typeof operationalPurpose !== 'string' || operationalPurpose.trim().length < 5) {
            throw new Error('INVALID_OPERATIONAL_PURPOSE');
          }
          if (!Array.isArray(supportedInstruments) || supportedInstruments.length === 0 || supportedInstruments.some(i => typeof i !== 'string')) {
            throw new Error('INVALID_SUPPORTED_INSTRUMENTS');
          }
          const validBehaviors = ['immediate', 'delayed', 'restricted', 'clearing'];
          if (!availabilityBehavior || !validBehaviors.includes(availabilityBehavior)) {
            throw new Error('INVALID_AVAILABILITY_BEHAVIOR');
          }

          // Force completeness
          isConfigured = 'complete';
        } else {
          // Canonical/Standard type derivations
          finalNature = getAccountNature(normalizedType);
        }

        const accountData: any = {
          organizationId,
          financeEntityId,
          name: trimmedName,
          normalizedName,
          type: normalizedType,
          nature: finalNature,
          configurationStatus: isConfigured,
          currency: 'BRL',
          active: true,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        };

        if (normalizedType === 'other') {
          accountData.operationalPurpose = operationalPurpose.trim();
          accountData.supportedInstruments = supportedInstruments;
          accountData.availabilityBehavior = availabilityBehavior;
        }

        if (institutionName !== undefined && institutionName !== null) accountData.institutionName = institutionName.trim();
        if (accountLast4 !== undefined && accountLast4 !== null) accountData.accountLast4 = accountLast4;

        const uniqueKeyData = {
          organizationId,
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

        const auditData = {
          organizationId,
          actorUid: uid,
          action: 'finance.account.created',
          entityType: 'financeAccount',
          entityId: accountId,
          requestId,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(accountRef, accountData);
        t.create(uniqueKeyRef, uniqueKeyData);
        t.create(auditRef, auditData);
      });

      return res.status(201).json({ id: accountId, success: true });
    } catch (txError: any) {
      if (txError.message === 'ACCOUNT_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'ACCOUNT_ALREADY_EXISTS' });
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
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Create account error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
