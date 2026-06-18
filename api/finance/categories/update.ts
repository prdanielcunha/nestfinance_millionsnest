import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { 
  normalizeFinanceName, 
  buildUniqueKeyLogicName, 
  generateUniqueKeyId,
  isValidCategoryId
} from '../../_lib/financeIdentity.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.NESTFINANCE_CATEGORIES_WRITE_ENABLED !== 'true') {
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

    const { categoryId, name, accountingCode } = req.body;

    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
    }

    if (!isValidCategoryId(categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
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

    let upperAccountingCode: string | null = null;
    if (accountingCode !== undefined && accountingCode !== null) {
      if (typeof accountingCode !== 'string') {
        return res.status(400).json({ error: 'INVALID_ACCOUNTING_CODE' });
      }
      const trimmedCode = accountingCode.trim();
      if (trimmedCode !== '') {
        const accountingCodeRegex = /^[A-Za-z0-9._/-]{1,32}$/;
        if (!accountingCodeRegex.test(trimmedCode)) {
          return res.status(400).json({ error: 'INVALID_ACCOUNTING_CODE_FORMAT' });
        }
        upperAccountingCode = trimmedCode.toUpperCase();
      }
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const uniqueKeysCol = orgRef.collection('financeUniqueKeys');
    const categoriesCol = orgRef.collection('financeCategories');
    const categoryRef = categoriesCol.doc(categoryId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    try {
      const result = await firestore.runTransaction(async (t) => {
        const categoryDoc = await t.get(categoryRef);
        if (!categoryDoc.exists) {
          throw new Error('CATEGORY_NOT_FOUND');
        }

        const categoryData = categoryDoc.data()!;
        if (categoryData.organizationId !== organizationId) {
          throw new Error('CATEGORY_NOT_FOUND');
        }

        const kind = categoryData.kind;
        const currentNormalizedName = categoryData.normalizedName;
        const currentName = categoryData.name;
        const currentAccountingCode = categoryData.accountingCode || null;

        const currentLogicalKey = buildUniqueKeyLogicName('category', currentNormalizedName, kind);
        const currentUniqueKeyId = generateUniqueKeyId(currentLogicalKey);
        const currentUniqueDoc = await t.get(uniqueKeysCol.doc(currentUniqueKeyId));

        const isNameChanged = currentNormalizedName !== normalizedName;
        const isVisualNameChanged = currentName !== trimmedName;
        const isAccountingCodeChanged = currentAccountingCode !== upperAccountingCode;

        if (!isNameChanged && !isVisualNameChanged && !isAccountingCodeChanged) {
          if (!currentUniqueDoc.exists) {
            const currentUniqueKeyData = {
              organizationId,
              entityType: 'financeCategory',
              entityId: categoryId,
              scope: kind,
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

          return {
            changed: false,
            category: {
              id: categoryId,
              name: currentName,
              kind: kind,
              accountingCode: currentAccountingCode || undefined,
              active: categoryData.active
            }
          };
        }

        let newUniqueKeyId: string | null = null;
        let newUniqueDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

        if (isNameChanged) {
          const newLogicalKey = buildUniqueKeyLogicName('category', normalizedName, kind);
          newUniqueKeyId = generateUniqueKeyId(newLogicalKey);
          newUniqueDoc = await t.get(uniqueKeysCol.doc(newUniqueKeyId));
          
          if (newUniqueDoc.exists) {
            throw new Error('CATEGORY_ALREADY_EXISTS');
          }

          const legacySnap = await t.get(categoriesCol.where('normalizedName', '==', normalizedName));
          const hasLegacy = legacySnap.docs.some(doc => doc.data().kind === kind && doc.id !== categoryId);
          if (hasLegacy) {
            throw new Error('CATEGORY_ALREADY_EXISTS');
          }
        }

        if (isNameChanged) {
          const newUniqueKeyData = {
            organizationId,
            entityType: 'financeCategory',
            entityId: categoryId,
            scope: kind,
            normalizedName,
            status: 'reserved',
            schemaVersion: 1,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          };
          t.create(uniqueKeysCol.doc(newUniqueKeyId!), newUniqueKeyData);
        }

        if (!currentUniqueDoc.exists) {
          const currentUniqueKeyData = {
            organizationId,
            entityType: 'financeCategory',
            entityId: categoryId,
            scope: kind,
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

        const categoryUpdateData: any = {
          name: trimmedName,
          normalizedName,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        };

        if (isAccountingCodeChanged) {
          categoryUpdateData.accountingCode = upperAccountingCode;
          if (upperAccountingCode === null) {
              categoryUpdateData.accountingCode = FieldValue.delete();
          }
        }

        t.update(categoryRef, categoryUpdateData);

        const auditChanges: any = {};
        if (isNameChanged || isVisualNameChanged) {
          auditChanges.name = {
            from: currentName,
            to: trimmedName
          };
        }
        if (isAccountingCodeChanged) {
          auditChanges.accountingCode = {
            from: currentAccountingCode,
            to: upperAccountingCode
          };
        }

        const auditData = {
          organizationId,
          actorUid: uid,
          action: 'finance.category.updated',
          entityType: 'financeCategory',
          entityId: categoryId,
          requestId,
          schemaVersion: 1,
          changes: auditChanges,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(auditRef, auditData);

        return {
          changed: true,
          category: {
            id: categoryId,
            name: trimmedName,
            kind: kind,
            accountingCode: upperAccountingCode || undefined,
            active: categoryData.active
          }
        };
      });

      return res.status(200).json(result);
    } catch (txError: any) {
      if (txError.message === 'CATEGORY_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'CATEGORY_ALREADY_EXISTS' });
      }
      if (txError.message === 'CATEGORY_NOT_FOUND') {
        return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' });
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
