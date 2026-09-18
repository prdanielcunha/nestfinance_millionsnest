import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileCheck2, ShieldCheck, Tag } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import {
  universalEvidenceInboxService,
  type UniversalEvidenceDetail,
} from '@/src/services/universalEvidenceInboxService';
import {
  UNIVERSAL_EVIDENCE_DOCUMENT_TYPES,
  type UniversalEvidenceDocumentType,
} from '../../../../shared/finance/universalEvidenceReview.js';
import { INBOX_REVIEW_COPY } from './inboxReviewCopy';
import { generateLedgerId } from '../../../../shared/finance/ledger/ids.js';

type Props = {
  evidence: UniversalEvidenceDetail;
  canClassify: boolean;
  canResolve: boolean;
  onChanged: () => Promise<void> | void;
};

function operationIds() {
  return {
    idempotencyKey: generateLedgerId('idem'),
    requestId: generateLedgerId('req'),
  };
}

export function UniversalEvidenceHumanReviewCard({
  evidence,
  canClassify,
  canResolve,
  onChanged,
}: Props) {
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = INBOX_REVIEW_COPY[language];
  const [selectedType, setSelectedType] = useState<UniversalEvidenceDocumentType | null>(
    evidence.classification?.documentType || null,
  );
  const [note, setNote] = useState(evidence.review?.note || '');
  const [saving, setSaving] = useState<'classification' | 'review' | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setSelectedType(evidence.classification?.documentType || null);
    setNote(evidence.review?.note || '');
    setError(false);
  }, [evidence.evidenceId, evidence.version, evidence.classification?.documentType, evidence.review?.note]);

  const organizationId = accessState.organizationId;
  const actionable =
    evidence.processingState === 'accepted' &&
    evidence.duplicate !== true &&
    Boolean(organizationId && activeFinanceEntityId);

  const status = useMemo(() => {
    if (evidence.review?.status === 'reviewed') {
      return {
        label: copy.reviewed,
        icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
        className: 'border-accent-primary/25 bg-accent-primary/10 text-accent-primary',
      };
    }
    if (evidence.classification) {
      return {
        label: copy.pendingReview,
        icon: <Clock3 className="h-4 w-4" aria-hidden="true" />,
        className: 'border-border-subtle bg-surface-secondary text-text-secondary',
      };
    }
    return {
      label: copy.notClassified,
      icon: <Tag className="h-4 w-4" aria-hidden="true" />,
      className: 'border-border-subtle bg-surface-secondary text-text-muted',
    };
  }, [copy, evidence.classification, evidence.review?.status]);

  const saveClassification = async () => {
    if (!actionable || !organizationId || !activeFinanceEntityId || !selectedType || !canClassify) return;
    setSaving('classification');
    setError(false);
    try {
      await universalEvidenceInboxService.classify(organizationId, activeFinanceEntityId, {
        evidenceId: evidence.evidenceId,
        expectedVersion: evidence.version,
        documentType: selectedType,
        ...operationIds(),
      });
      await onChanged();
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const markReviewed = async () => {
    if (
      !actionable ||
      !organizationId ||
      !activeFinanceEntityId ||
      !evidence.classification ||
      !canResolve ||
      evidence.review?.status === 'reviewed'
    ) return;

    setSaving('review');
    setError(false);
    try {
      await universalEvidenceInboxService.review(organizationId, activeFinanceEntityId, {
        evidenceId: evidence.evidenceId,
        expectedVersion: evidence.version,
        note,
        ...operationIds(),
      });
      await onChanged();
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  if (!actionable) return null;

  return (
    <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-accent-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
        </div>
        <span className={`inline-flex min-h-8 shrink-0 items-center gap-2 self-start rounded-full border px-3 text-xs font-semibold ${status.className}`}>
          {status.icon}
          {status.label}
        </span>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-text-primary">{copy.chooseType}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {UNIVERSAL_EVIDENCE_DOCUMENT_TYPES.map((type) => (
            <Button
              key={type}
              variant={selectedType === type ? 'primary' : 'secondary'}
              fullWidth
              disabled={!canClassify || Boolean(saving)}
              onClick={() => setSelectedType(type)}
              className="!min-h-12 !justify-start"
            >
              {copy.types[type]}
            </Button>
          ))}
        </div>

        {canClassify ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              disabled={
                !selectedType ||
                Boolean(saving) ||
                selectedType === evidence.classification?.documentType
              }
              onClick={() => void saveClassification()}
            >
              {saving === 'classification'
                ? copy.saving
                : evidence.classification
                  ? copy.changeType
                  : copy.saveType}
            </Button>
            {evidence.review?.status === 'reviewed' ? (
              <p className="text-xs leading-relaxed text-text-muted">{copy.reclassifyWarning}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {evidence.classification ? (
        <div className="mt-6 border-t border-border-subtle pt-5">
          {evidence.review?.status === 'reviewed' ? (
            <div className="rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium text-text-primary">{copy.reviewed}</p>
                  {evidence.review.note ? (
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{evidence.review.note}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : canResolve ? (
            <>
              <label className="block text-sm font-semibold text-text-primary" htmlFor="evidence-review-note">
                {copy.noteLabel}
              </label>
              <textarea
                id="evidence-review-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder={copy.notePlaceholder}
                className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-primary"
              />
              <Button className="mt-3" disabled={Boolean(saving)} onClick={() => void markReviewed()}>
                {saving === 'review' ? copy.saving : copy.reviewAction}
              </Button>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-text-muted">{copy.reviewerRequired}</p>
          )}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-semantic-danger/20 bg-semantic-danger/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
          <div>
            <p className="font-medium text-text-primary">{copy.errorTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex gap-3 rounded-xl border border-border-subtle bg-surface-secondary/50 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-text-muted">{copy.safety}</p>
      </div>
    </Surface>
  );
}
