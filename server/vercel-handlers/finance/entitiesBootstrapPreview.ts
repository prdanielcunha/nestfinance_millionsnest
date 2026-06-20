import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { canManageFinanceBootstrap } from './bootstrapAvailabilityHelper.js';
import { BOOTSTRAP_TEMPLATES, BootstrapPlanItem } from '../../../shared/finance/bootstrapTemplates.js';
import { normalizeName, computePreviewDigest } from '../../../shared/finance/bootstrapHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
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

    const { financeEntityId, templateId, legacyAssignment, selection } = req.body;
    
    if (!financeEntityId || typeof financeEntityId !== 'string' || !templateId || !selection) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const authorization = await canManageFinanceBootstrap(uid, organizationId, financeEntityId);
    if (!authorization.canApply) {
      return res.status(403).json({ error: 'FORBIDDEN', reason: authorization.reason });
    }

    const templates = BOOTSTRAP_TEMPLATES[templateId as keyof typeof BOOTSTRAP_TEMPLATES];
    if (!templates) {
       return res.status(400).json({ error: 'INVALID_TEMPLATE_ID' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const entityDoc = await orgRef.collection('financeEntities').doc(financeEntityId).get();
    
    if (!entityDoc.exists) {
        return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    }

    const entityData = entityDoc.data()!;

    // Load unscoped + scoped items
    const accountsSnap = await orgRef.collection('financeAccounts').get();
    const fundsSnap = await orgRef.collection('financeFunds').get();
    const categoriesSnap = await orgRef.collection('financeCategories').get();
    
    const OBPC_ORG_ID = 'JPrzMnxJu77hTLJtu7FT';
    const MONTE_CASTELO_ID = 'fent_b813f062431581b136f98a9dd1432dcc';
    const canAdoptLegacyData = (organizationId === OBPC_ORG_ID && financeEntityId === MONTE_CASTELO_ID);
    const useLegacy = legacyAssignment === 'assign_unscoped_to_this_entity' && canAdoptLegacyData;

    const unscopedAccounts = accountsSnap.docs.filter(d => !d.data().financeEntityId && useLegacy);
    const unscopedFunds = fundsSnap.docs.filter(d => !d.data().financeEntityId && useLegacy);
    const unscopedCategories = categoriesSnap.docs.filter(d => !d.data().financeEntityId && useLegacy);

    const scopedAccounts = accountsSnap.docs.filter(d => d.data().financeEntityId === financeEntityId);
    const scopedFunds = fundsSnap.docs.filter(d => d.data().financeEntityId === financeEntityId);
    const scopedCategories = categoriesSnap.docs.filter(d => d.data().financeEntityId === financeEntityId);

    const plan: { accounts: BootstrapPlanItem[], funds: BootstrapPlanItem[], categories: BootstrapPlanItem[] } = {
       accounts: [], funds: [], categories: []
    };

    const summary = { adopt: 0, create: 0, skip: 0, conflict: 0 };
    
    const bucketMap: Record<string, keyof typeof plan> = {
      account: 'accounts',
      fund: 'funds',
      category: 'categories'
    };

    const processItems = (type: 'account' | 'fund' | 'category', unscoped: any[], scoped: any[], selectedKeys: string[]) => {
       const templateItems = templates.filter(t => t.entityType === type);
       const handledUnscopedIds = new Set<string>();
       
       const planKey = bucketMap[type];
       if (!planKey || !plan[planKey]) {
          throw new Error(`BOOTSTRAP_PREVIEW_INVALID_ITEM_TYPE: ${type}`);
       }

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
                templateKey: tItem.templateKey,
                entityType: type,
                existingId: collisionWithScoped.id,
                name: tItem.name,
                kind: tItem.kind as any,
                action: 'conflict',
                reason: 'ALREADY_SCOPED',
                active: collisionWithScoped.data().active
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
             if (isSelected) {
                plan[planKey].push({
                   templateKey: tItem.templateKey,
                   entityType: type,
                   existingId: legacyMatch.id,
                   name: legacyMatch.data().name || tItem.name,
                   kind: tItem.kind as any,
                   action: 'adopt',
                   reason: 'LEGACY_MATCH',
                   active: legacyMatch.data().active
                });
                summary.adopt++;
             } else {
                plan[planKey].push({
                   templateKey: tItem.templateKey,
                   entityType: type,
                   existingId: legacyMatch.id,
                   name: legacyMatch.data().name || tItem.name,
                   kind: tItem.kind as any,
                   action: 'adopt', // Wait, if legacy exists but template is not selected, do we adopt it anyway? 
                                    // Let's decide legacy data is ALWAYS adopted if assign_unscoped_to_this_entity, regardless of template selection!
                   reason: 'LEGACY_MATCH',
                   active: legacyMatch.data().active
                });
                summary.adopt++;
             }
             handledUnscopedIds.add(legacyMatch.id);
          } else {
             if (isSelected) {
                plan[planKey].push({
                   templateKey: tItem.templateKey,
                   entityType: type,
                   existingId: null,
                   name: tItem.name,
                   kind: tItem.kind as any,
                   action: 'create',
                   reason: 'TEMPLATE_SELECTED',
                   active: true
                });
                summary.create++;
             } else {
                plan[planKey].push({
                   templateKey: tItem.templateKey,
                   entityType: type,
                   existingId: null,
                   name: tItem.name,
                   kind: tItem.kind as any,
                   action: 'skip',
                   reason: 'NOT_SELECTED',
                   active: null
                });
                summary.skip++;
             }
          }
       }

       // Handle remaining unscoped that didn't match any template
       for (const u of unscoped) {
          if (!handledUnscopedIds.has(u.id)) {
             plan[planKey].push({
                 templateKey: null,
                 entityType: type,
                 existingId: u.id,
                 name: u.data().name,
                 kind: u.data().kind as any,
                 action: 'adopt',
                 reason: 'LEGACY_MATCH',
                 active: u.data().active
             });
             summary.adopt++;
          }
       }
    };

    const sAccounts = Array.isArray(selection.accountTemplateKeys) ? selection.accountTemplateKeys : [];
    const sFunds = Array.isArray(selection.fundTemplateKeys) ? selection.fundTemplateKeys : [];
    const sCategories = Array.isArray(selection.categoryTemplateKeys) ? selection.categoryTemplateKeys : [];

    processItems('account', unscopedAccounts, scopedAccounts, sAccounts);
    processItems('fund', unscopedFunds, scopedFunds, sFunds);
    processItems('category', unscopedCategories, scopedCategories, sCategories);

    const sortPlanItems = (items: BootstrapPlanItem[]) => {
       return items.sort((a, b) => {
           // We can assume sortOrder maps to templateKey but we don't have sortOrder on the item right now.
           // Let's sort by templateKey (if present) then existingId (if present).
           if (a.templateKey && b.templateKey) {
               return a.templateKey.localeCompare(b.templateKey);
           }
           if (a.templateKey && !b.templateKey) return -1;
           if (!a.templateKey && b.templateKey) return 1;
           if (a.existingId && b.existingId) {
               return a.existingId.localeCompare(b.existingId);
           }
           return 0;
       });
    };

    plan.accounts = sortPlanItems(plan.accounts);
    plan.funds = sortPlanItems(plan.funds);
    plan.categories = sortPlanItems(plan.categories);

    const { PAYMENT_METHODS } = await import('../../../shared/finance/paymentMethods.js');
    const enrichedPaymentMethods = PAYMENT_METHODS.map(pm => ({
        code: pm.code,
        label: pm.label,
        description: pm.description,
        enabled: selection.paymentMethodCodes ? selection.paymentMethodCodes.includes(pm.code) : pm.defaultEnabled,
        defaultEnabled: pm.defaultEnabled,
        recommended: pm.recommended,
        supportsIncome: pm.supportsIncome,
        supportsExpense: pm.supportsExpense
    }));

    const finalPaymentMethodCodes = enrichedPaymentMethods.filter(pm => pm.enabled).map(pm => pm.code);
    const previewDigest = computePreviewDigest(financeEntityId, templateId, legacyAssignment, plan, finalPaymentMethodCodes);

    const { getApplicationAvailability } = await import('./bootstrapAvailabilityHelper.js');
    const applicationAvailability = await getApplicationAvailability(financeEntityId);

    return res.status(200).json({
       financeEntity: {
          id: financeEntityId,
          displayName: entityData.displayName,
          city: entityData.operationalAddressSameAsRegistered ? entityData.registeredAddress?.city || null : entityData.operationalAddress?.city || null,
          state: entityData.operationalAddressSameAsRegistered ? entityData.registeredAddress?.state || null : entityData.operationalAddress?.state || null
       },
       template: {
          id: templateId,
          version: 1
       },
       plan,
       summary,
       paymentMethods: enrichedPaymentMethods,
       warnings: [],
       canApply: summary.conflict === 0 && (summary.create > 0 || summary.adopt > 0),
       previewDigest,
       applicationAvailability
    });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities bootstrap preview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
