import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession, isValidIanaTimeZone } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security Headers
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

  if (process.env.NESTFINANCE_SETUP_WRITE_ENABLED !== 'true') {
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
    const mn_app_id = decodedToken.mn_app_id;
    const mn_handoff_version = decodedToken.mn_handoff_version;
    const mn_organization_id = decodedToken.mn_organization_id;

    if (mn_app_id !== 'nestfinance' || mn_handoff_version !== 1 || !mn_organization_id || typeof mn_organization_id !== 'string') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const resolution = await resolveEcosystemSession(uid, mn_organization_id);

    if (!resolution.granted || !resolution.isGlobalAccess) {
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
      timezone,
      fiscalYearStartMonth,
      fiscalMonthStartDay,
      contributionEntryMode,
      identifiedContributionsEnabled,
      requireTwoCounters,
      requireDistinctCounters,
      requireIndependentCount,
      requireClosingApproval,
      allowAssistedEntry,
      prohibitSelfApproval,
      ...extraProps
    } = req.body;

    if (Object.keys(extraProps).length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES' });
    }

    if (!isValidIanaTimeZone(timezone)) {
      return res.status(400).json({ error: 'INVALID_TIMEZONE' });
    }

    if (typeof fiscalYearStartMonth !== 'number' || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      return res.status(400).json({ error: 'INVALID_FISCAL_YEAR_START_MONTH' });
    }
    
    if (typeof fiscalMonthStartDay !== 'number' || fiscalMonthStartDay < 1 || fiscalMonthStartDay > 28) {
      return res.status(400).json({ error: 'INVALID_FISCAL_MONTH_START_DAY' });
    }

    const validModes = ['aggregate', 'anonymous_items', 'identified_items', 'mixed'];
    if (!validModes.includes(contributionEntryMode)) {
      return res.status(400).json({ error: 'INVALID_ENTRY_MODE' });
    }

    if (typeof identifiedContributionsEnabled !== 'boolean' || 
        typeof requireTwoCounters !== 'boolean' ||
        typeof requireDistinctCounters !== 'boolean' ||
        typeof requireIndependentCount !== 'boolean' ||
        typeof requireClosingApproval !== 'boolean' ||
        typeof allowAssistedEntry !== 'boolean' ||
        typeof prohibitSelfApproval !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_BOOLEAN_FIELDS' });
    }

    if ((contributionEntryMode === 'aggregate' || contributionEntryMode === 'anonymous_items') && identifiedContributionsEnabled !== false) {
      return res.status(400).json({ error: 'CONTRADICTORY_CONFIGURATION' });
    }

    const configRef = firestore.collection('organizations').doc(mn_organization_id).collection('financeSettings').doc('config');
    const auditRef = firestore.collection('organizations').doc(mn_organization_id).collection('financeAuditLogs').doc();
    const requestId = Math.random().toString(36).substring(2, 15);

    await firestore.runTransaction(async (t) => {
      const existingDoc = await t.get(configRef);
      if (existingDoc.exists) {
        throw new Error('SETUP_ALREADY_INITIALIZED');
      }

      t.set(configRef, {
        organizationId: mn_organization_id,
        locale: 'pt-BR',
        currency: 'BRL',
        timezone,
        fiscalYearStartMonth,
        fiscalMonthStartDay,
        contributionPolicy: {
          entryMode: contributionEntryMode,
          identifiedContributionsEnabled,
        },
        closingPolicy: {
          requireTwoCounters,
          requireDistinctCounters,
          requireIndependentCount,
          requireApproval: requireClosingApproval,
          allowAssistedEntry,
        },
        approvalPolicy: {
          prohibitSelfApproval,
        },
        ai: {
          enabled: false,
          dailyDocumentLimit: 0,
          monthlyDocumentLimit: 0,
          escalationEnabled: false,
        },
        retention: {
          exportsDays: 30,
          technicalJobsDays: 30,
        },
        featureFlags: {},
        setupStatus: 'base_configured',
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      });

      t.set(auditRef, {
        organizationId: mn_organization_id,
        actorUid: uid,
        action: 'finance.setup.initialized',
        entityType: 'financeSettings',
        entityId: 'config',
        requestId,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(201).json({ status: 'created' });
  } catch (error: any) {
    if (error.message === 'SETUP_ALREADY_INITIALIZED') {
      return res.status(409).json({ error: 'SETUP_ALREADY_INITIALIZED' });
    }
    // Handle specific auth errors if needed
    if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
       return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
