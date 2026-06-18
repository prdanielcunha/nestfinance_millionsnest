import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { isValidAccountId } from '../../../api/_lib/financeIdentity.js';

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

    const { accountId } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID' });
    }

    if (!isValidAccountId(accountId)) {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_ID' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
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

        if (accountData.active === true) {
          return {
            account: {
              id: accountDoc.id,
              name: accountData.name,
              type: accountData.type,
              institutionName: accountData.institutionName,
              accountLast4: accountData.accountLast4,
              currency: accountData.currency,
              active: true,
            },
            changed: false,
          };
        }

        t.update(accountRef, {
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });

        const auditData = {
          organizationId,
          actorUid: uid,
          action: 'finance.account.reactivated',
          entityType: 'financeAccount',
          entityId: accountId,
          requestId,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(auditRef, auditData);

        return {
          account: {
            id: accountDoc.id,
            name: accountData.name,
            type: accountData.type,
            institutionName: accountData.institutionName,
            accountLast4: accountData.accountLast4,
            currency: accountData.currency,
            active: true,
          },
          changed: true,
        };
      });

      return res.status(200).json(result);
    } catch (txError: any) {
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
