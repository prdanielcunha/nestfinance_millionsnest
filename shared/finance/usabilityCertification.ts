export const USABILITY_PILOT_PERSONAS = [
  'elderly_first_time_user',
  'young_layperson',
  'treasurer',
  'accountant',
] as const;

export const USABILITY_PILOT_ROUNDS = [1, 2, 3] as const;

export type UsabilityPilotPersona = typeof USABILITY_PILOT_PERSONAS[number];
export type UsabilityPilotRound = typeof USABILITY_PILOT_ROUNDS[number];

export type UsabilityPilotEvidence = {
  persona: UsabilityPilotPersona;
  round: UsabilityPilotRound;
  outcome: 'pass' | 'needs_correction';
  sessionDate: string;
  evidenceRef: string;
  notes?: string;
};

export type UsabilityCertificationStatus =
  | 'pending_human_pilot'
  | 'corrections_required'
  | 'human_pilot_complete';

export function evaluateUsabilityCertification(
  evidence: readonly UsabilityPilotEvidence[],
) {
  const required = USABILITY_PILOT_ROUNDS.flatMap((round) =>
    USABILITY_PILOT_PERSONAS.map((persona) => ({ round, persona })),
  );

  const missing = required.filter(({ round, persona }) =>
    !evidence.some((item) =>
      item.round === round &&
      item.persona === persona &&
      item.sessionDate.trim().length > 0 &&
      item.evidenceRef.trim().length > 0,
    ),
  );

  const corrections = evidence.filter((item) => item.outcome === 'needs_correction');

  const status: UsabilityCertificationStatus =
    missing.length > 0
      ? 'pending_human_pilot'
      : corrections.length > 0
        ? 'corrections_required'
        : 'human_pilot_complete';

  return {
    status,
    requiredSessions: required.length,
    suppliedSessions: evidence.length,
    missing,
    correctionCount: corrections.length,
    postingCertificationIncluded: false as const,
  };
}
