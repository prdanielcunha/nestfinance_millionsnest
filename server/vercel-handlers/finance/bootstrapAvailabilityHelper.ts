export type AvailabilityReason = 'disabled' | 'entity_not_enabled' | 'available';

export interface ApplicationAvailability {
  available: boolean;
  reason: AvailabilityReason;
}

export async function getApplicationAvailability(financeEntityId: string): Promise<ApplicationAvailability> {
  const isApplyEnabled = process.env.NESTFINANCE_BOOTSTRAP_APPLY_ENABLED === 'true';
  
  if (!isApplyEnabled) {
    return { available: false, reason: 'disabled' };
  }

  const rawList = process.env.NESTFINANCE_BOOTSTRAP_APPLY_ALLOWED_ENTITY_IDS || '';
  if (!rawList.trim()) {
    return { available: false, reason: 'entity_not_enabled' };
  }

  const { isValidFinanceEntityId } = await import('../../../api/_lib/financeIdentity.js');

  const allowedIds = new Set(
    rawList
      .split(',')
      .map(s => s.trim())
      .filter(s => isValidFinanceEntityId(s))
  );

  if (allowedIds.has(financeEntityId)) {
    return { available: true, reason: 'available' };
  }

  return { available: false, reason: 'entity_not_enabled' };
}
