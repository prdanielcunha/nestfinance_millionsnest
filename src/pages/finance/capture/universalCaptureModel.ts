export type UniversalCaptureContext = Readonly<{
  organizationId: string;
  financeEntityId: string;
  financeEntityName: string;
  epoch: number;
}>;

export function createUniversalCaptureContext(args: {
  organizationId: string;
  financeEntityId: string;
  financeEntityName?: string | null;
  epoch: number;
}): UniversalCaptureContext {
  return Object.freeze({
    organizationId: args.organizationId,
    financeEntityId: args.financeEntityId,
    financeEntityName: args.financeEntityName?.trim() || args.financeEntityId,
    epoch: args.epoch,
  });
}

export function hasUniversalCaptureContextChanged(
  context: UniversalCaptureContext,
  organizationId: string,
  financeEntityId: string | null,
): boolean {
  return context.organizationId !== organizationId || context.financeEntityId !== financeEntityId;
}

export function isUniversalCaptureEpochCurrent(requestEpoch: number, currentEpoch: number): boolean {
  return requestEpoch === currentEpoch;
}
