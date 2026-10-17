import { isExplicitCountOnlySession } from './countTeamOperationPolicy.js';

/**
 * Per-session privacy is independent of finance-entity scope.
 * A Count-only member cannot inspect or modify another counter's draft merely
 * because both people belong to the same church. Treasury personnel with real
 * financial authority retain the existing canonical finance access checks.
 */
type CountSessionRecord = Record<string, any>;
type VerifiedSession = Parameters<typeof isExplicitCountOnlySession>[0];

function validActor(uid: unknown): uid is string {
  return typeof uid === 'string' && uid.trim().length > 0;
}

export function isCountSessionParticipant(session: CountSessionRecord, uid: unknown): boolean {
  if (!validActor(uid)) return false;
  const actors = [
    session.createdByUid,
    session.countA?.countedByUid,
    session.countA?.enteredByUid,
    session.secondCountStartedByUid,
    session.secondCountAssignedToUid,
    session.countB?.countedByUid,
    session.countB?.enteredByUid,
    session.activeRecount?.startedByUid,
    ...(Array.isArray(session.recountAttempts)
      ? session.recountAttempts.flatMap((attempt: any) =>
          [attempt?.countedByUid, attempt?.enteredByUid])
      : []),
  ];
  return actors.some(actor => actor === uid);
}

export function canReadCountSession(
  verifiedSession: VerifiedSession,
  countSession: CountSessionRecord,
  uid: unknown,
): boolean {
  return !isExplicitCountOnlySession(verifiedSession) || isCountSessionParticipant(countSession, uid);
}

export function assertCountSessionParticipant(
  verifiedSession: VerifiedSession,
  countSession: CountSessionRecord,
  uid: unknown,
): void {
  if (!canReadCountSession(verifiedSession, countSession, uid)) {
    throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
  }
}

/** A first-count draft belongs to its creator or the already recorded first operator. */
export function assertCountFirstStageOwner(
  verifiedSession: VerifiedSession,
  countSession: CountSessionRecord,
  uid: unknown,
): void {
  if (!isExplicitCountOnlySession(verifiedSession)) return;
  if (!validActor(uid) || ![
    countSession.createdByUid,
    countSession.countA?.enteredByUid,
    countSession.countA?.countedByUid,
  ].some(actor => actor === uid)) {
    throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
  }
}

/** Submitting a blind recount cannot be taken over by a different Count-only worker. */
export function assertActiveRecountOperator(
  verifiedSession: VerifiedSession,
  countSession: CountSessionRecord,
  uid: unknown,
): void {
  if (!isExplicitCountOnlySession(verifiedSession)) return;
  if (!validActor(uid) || countSession.activeRecount?.startedByUid !== uid) {
    throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
  }
}

/**
 * A paper/photo capture belongs to the active independent counting stage.
 * A shared QR identifies the paper, never the operator's authority.
 */
export function assertCountCaptureStageOperator(
  verifiedSession: VerifiedSession,
  countSession: CountSessionRecord,
  uid: unknown,
  stage: unknown,
): void {
  if (!isExplicitCountOnlySession(verifiedSession)) return;
  if (stage === 'count_a') {
    assertCountFirstStageOwner(verifiedSession, countSession, uid);
    return;
  }
  if (stage !== 'count_b' || !validActor(uid) ||
    !countSession.secondCountAssignedToUid ||
    countSession.secondCountAssignedToUid !== uid ||
    (countSession.countA?.enteredByUid || countSession.countA?.countedByUid) === uid) {
    throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
  }
}

/** Count evidence mutations are private to the uploader until an explicit
 * assisted-review grant exists. Sharing a capture ID cannot authorize edits
 * or AI extraction of another person's photo. */
export function assertCountCaptureOwner(
  verifiedSession: VerifiedSession,
  capture: CountSessionRecord,
  uid: unknown,
): void {
  if (!isExplicitCountOnlySession(verifiedSession)) return;
  if (!validActor(uid) || capture.createdByUid !== uid) {
    throw { status: 403, error: 'COUNT_CAPTURE_NOT_ASSIGNED' };
  }
}
