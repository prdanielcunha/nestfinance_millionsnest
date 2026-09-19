export const UNIVERSAL_EVIDENCE_ID_PATTERN = /^evd_[a-f0-9]{32}$/;

export function classifyTransactionEvidenceReference(input: {
  evidenceId: unknown;
  organizationId: string;
  financeEntityId: string;
}): 'universal_evidence' | 'legacy_entity_storage' | 'invalid' {
  if (typeof input.evidenceId !== 'string' || !input.evidenceId.trim()) return 'invalid';
  const evidenceId = input.evidenceId.trim();
  if (UNIVERSAL_EVIDENCE_ID_PATTERN.test(evidenceId)) return 'universal_evidence';

  const prefix = `organizations/${input.organizationId}/financeEntities/${input.financeEntityId}/evidence/`;
  if (evidenceId.startsWith(prefix) && evidenceId.length > prefix.length && !evidenceId.includes('..')) {
    return 'legacy_entity_storage';
  }
  return 'invalid';
}

export async function assertTransactionEvidenceReferences(input: {
  transaction: any;
  evidenceIds: unknown;
  organizationId: string;
  financeEntityId: string;
  entityRef: any;
}) {
  if (input.evidenceIds === undefined) return;
  if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length > 50) {
    throw { code: 'FINANCE_EVIDENCE_MISMATCH', message: 'Invalid evidence list' };
  }

  const seen = new Set<string>();
  for (const raw of input.evidenceIds) {
    const kind = classifyTransactionEvidenceReference({
      evidenceId: raw,
      organizationId: input.organizationId,
      financeEntityId: input.financeEntityId,
    });
    if (kind === 'invalid') {
      throw { code: 'FINANCE_EVIDENCE_MISMATCH', message: 'Evidence is outside the selected finance entity' };
    }

    const evidenceId = String(raw);
    if (seen.has(evidenceId)) {
      throw { code: 'FINANCE_EVIDENCE_MISMATCH', message: 'Duplicate evidence reference' };
    }
    seen.add(evidenceId);

    if (kind === 'universal_evidence') {
      const snapshot = await input.transaction.get(
        input.entityRef.collection('universalEvidence').doc(evidenceId),
      );
      const evidence = snapshot.data() || {};
      if (
        !snapshot.exists ||
        evidence.organizationId !== input.organizationId ||
        evidence.financeEntityId !== input.financeEntityId ||
        !['accepted', 'duplicate'].includes(String(evidence.processingState || '')) ||
        Number(evidence.version || 0) < 2
      ) {
        throw { code: 'FINANCE_EVIDENCE_MISMATCH', message: 'Universal evidence is not valid for this finance entity' };
      }
    }
  }
}
