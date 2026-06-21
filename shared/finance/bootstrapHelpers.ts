import { createHash } from 'crypto';
import { BootstrapApplyRequest, BootstrapPlanItem } from './bootstrapTemplates';

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim();
}

export function buildAccountUniqKey(financeEntityId: string, name: string): string {
  const logicalKey = `account:${financeEntityId}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}

export function buildFundUniqKey(financeEntityId: string, name: string): string {
  const logicalKey = `fund:${financeEntityId}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}

export function buildCategoryUniqKey(financeEntityId: string, kind: 'income' | 'expense', name: string): string {
  const logicalKey = `category:${financeEntityId}:${kind}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}

export function normalizeExpectedBootstrapState(
  type: 'account' | 'fund' | 'category',
  data: any
): any {
  const payload: any = {
    active: typeof data.active === 'boolean' ? data.active : true,
    customized: typeof data.customized === 'boolean' ? data.customized : false,
    documentId: data.documentId,
    financeEntityId: data.financeEntityId,
    normalizedName: normalizeName(data.name || data.normalizedName || ''),
    source: data.source || 'setup_template',
    templateId: data.templateId || null,
    templateKey: data.templateKey || null,
    templateVersion: data.templateKey ? 1 : null,
  };

  if (type === 'account') {
    payload.type = data.type || 'checking';
  } else if (type === 'fund') {
    payload.restricted = typeof data.restricted === 'boolean' ? data.restricted : false;
  } else if (type === 'category') {
    payload.kind = data.kind;
  }

  return payload;
}

export function normalizePersistedBootstrapState(
  type: 'account' | 'fund' | 'category',
  docId: string,
  data: any
): any {
  const payload: any = {
    active: typeof data.active === 'boolean' ? data.active : true,
    customized: typeof data.customized === 'boolean' ? data.customized : false,
    documentId: docId,
    financeEntityId: data.financeEntityId,
    normalizedName: normalizeName(data.name || ''),
    source: data.source || 'setup_template',
    templateId: data.templateId || null,
    templateKey: data.templateKey || null,
    templateVersion: data.templateKey ? 1 : null,
  };

  if (type === 'account') {
    payload.type = data.type || 'checking';
  } else if (type === 'fund') {
    payload.restricted = typeof data.restricted === 'boolean' ? data.restricted : false;
  } else if (type === 'category') {
    payload.kind = data.kind;
  }

  return payload;
}

export function computeExpectedStateHash(
  payload: any
): string {
  // order keys deterministically
  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: any = {};
  for (const k of sortedKeys) {
    if (payload[k] !== undefined && payload[k] !== null) {
      if (Array.isArray(payload[k])) {
         sortedPayload[k] = [...payload[k]].sort();
      } else {
         sortedPayload[k] = payload[k];
      }
    }
  }

  const canonicalString = JSON.stringify(sortedPayload);
  return createHash('sha256').update(canonicalString).digest('hex');
}

export function computePreviewDigest(
  financeEntityId: string,
  templateId: string,
  legacyAssignment: string,
  plan: { accounts: BootstrapPlanItem[], funds: BootstrapPlanItem[], categories: BootstrapPlanItem[] },
  paymentMethodCodes: string[]
): string {
  const sortedPMs = [...paymentMethodCodes].sort();
  
  const extractItemKeys = (items: BootstrapPlanItem[]) => {
    return items.map(item => ({
      entityType: item.entityType,
      templateKey: item.templateKey,
      existingId: item.existingId,
      normalizedName: normalizeName(item.name),
      kind: item.kind,
      action: item.action,
      reason: item.reason,
      active: item.active
    })).sort((a, b) => {
      if (a.templateKey && b.templateKey) return a.templateKey.localeCompare(b.templateKey);
      if (a.templateKey && !b.templateKey) return -1;
      if (!a.templateKey && b.templateKey) return 1;
      if (a.existingId && b.existingId) return a.existingId.localeCompare(b.existingId);
      return 0;
    });
  };

  const payload = {
    financeEntityId,
    templateId,
    templateVersion: 1,
    legacyAssignment,
    accounts: extractItemKeys(plan.accounts),
    funds: extractItemKeys(plan.funds),
    categories: extractItemKeys(plan.categories),
    paymentMethodCodes: sortedPMs
  };

  const canonicalString = JSON.stringify(payload);
  return createHash('sha256').update(canonicalString).digest('hex');
}
