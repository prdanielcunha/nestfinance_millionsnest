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

export function computeExpectedStateHash(
  type: 'account' | 'fund' | 'category',
  data: any
): string {
  const payload: any = {};
  if (type === 'account') {
    payload.active = data.active;
    payload.customized = data.customized;
    payload.documentId = data.documentId;
    payload.financeEntityId = data.financeEntityId;
    payload.normalizedName = data.normalizedName;
    payload.source = data.source;
    payload.templateId = data.templateId;
    payload.templateKey = data.templateKey;
    payload.templateVersion = data.templateVersion;
    payload.type = data.type;
  } else if (type === 'fund') {
    payload.active = data.active;
    payload.customized = data.customized;
    payload.documentId = data.documentId;
    payload.financeEntityId = data.financeEntityId;
    payload.normalizedName = data.normalizedName;
    payload.restricted = data.restricted;
    payload.source = data.source;
    payload.templateId = data.templateId;
    payload.templateKey = data.templateKey;
    payload.templateVersion = data.templateVersion;
  } else if (type === 'category') {
    payload.active = data.active;
    payload.customized = data.customized;
    payload.documentId = data.documentId;
    payload.financeEntityId = data.financeEntityId;
    payload.kind = data.kind;
    payload.normalizedName = data.normalizedName;
    payload.source = data.source;
    payload.templateId = data.templateId;
    payload.templateKey = data.templateKey;
    payload.templateVersion = data.templateVersion;
  }
  
  // order keys
  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: any = {};
  for (const k of sortedKeys) {
    if (payload[k] !== undefined) {
      sortedPayload[k] = payload[k];
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
