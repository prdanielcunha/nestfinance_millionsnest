import type { AccessibleFinanceEntity } from '@/src/services/financeEntitiesService';

export function selectPreferredFinanceEntity(
  entities: AccessibleFinanceEntity[],
  sessionId: string | null,
  rememberedId: string | null,
): AccessibleFinanceEntity | undefined {
  const sessionEntity = sessionId
    ? entities.find((entity) => entity.id === sessionId)
    : undefined;
  if (sessionEntity) return sessionEntity;

  const rememberedEntity = rememberedId
    ? entities.find((entity) => entity.id === rememberedId)
    : undefined;
  if (rememberedEntity) return rememberedEntity;

  return entities.length === 1 ? entities[0] : undefined;
}
