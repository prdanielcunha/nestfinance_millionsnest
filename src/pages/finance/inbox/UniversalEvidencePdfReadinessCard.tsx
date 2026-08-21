import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSearch, HelpCircle } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import {
  universalEvidenceInboxService,
  type UniversalEvidenceDetail,
  type UniversalEvidencePdfReadinessResponse,
} from '@/src/services/universalEvidenceInboxService';
import { normalizeInboxEvidenceState } from './inboxModel';
import { PDF_READINESS_COPY } from './pdfReadinessCopy';

type Props = {
  evidence: UniversalEvidenceDetail;
};

export function UniversalEvidencePdfReadinessCard({ evidence }: Props) {
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = PDF_READINESS_COPY[language];
  const [analysis, setAnalysis] = useState<UniversalEvidencePdfReadinessResponse['analysis'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const epochRef = useRef(0);

  const state = normalizeInboxEvidenceState(evidence.processingState);
  const eligible =
    (state === 'accepted' || state === 'duplicate') &&
    evidence.version === 2 &&
    evidence.verifiedMimeType === 'application/pdf' &&
    evidence.verification.immutableOriginal &&
    evidence.verification.mimeVerified &&
    evidence.verification.sizeVerified &&
    evidence.verification.contentHashVerified;

  useEffect(() => {
    epochRef.current += 1;
    setAnalysis(null);
    setErrorDetails(null);
    setLoading(false);
  }, [accessState.organizationId, activeFinanceEntityId, evidence.evidenceId]);

  if (!eligible) return null;

  const inspect = async () => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId) return;

    const epoch = ++epochRef.current;
    setLoading(true);
    setErrorDetails(null);

    try {
      const response = await universalEvidenceInboxService.inspectPdfTextLayer(
        organizationId,
        activeFinanceEntityId,
        evidence.evidenceId,
      );
      if (epoch !== epochRef.current) return;
      setAnalysis(response.analysis);
    } catch (error: any) {
      if (epoch !== epochRef.current) return;
      setAnalysis(null);
      setErrorDetails(error?.details || { error: error?.message });
    } finally {
      if (epoch !== epochRef.current) return;
      setLoading(false);
    }
  };

  const presentation = analysis?.textLayerState === 'detected'
    ? {
        title: copy.detectedTitle,
        body: copy.detectedBody,
        icon: <CheckCircle2 className="h-5 w-5" aria-hidden="true" />,
        className: 'border-accent-primary/25 bg-accent-primary/10 text-accent-primary',
      }
    : analysis?.textLayerState === 'not_detected'
      ? {
          title: copy.notDetectedTitle,
          body: copy.notDetectedBody,
          icon: <HelpCircle className="h-5 w-5" aria-hidden="true" />,
          className: 'border-border-subtle bg-surface-secondary text-text-secondary',
        }
      : analysis
        ? {
            title: copy.unknownTitle,
            body: copy.unknownBody,
            icon: <HelpCircle className="h-5 w-5" aria-hidden="true" />,
            className: 'border-border-subtle bg-surface-secondary text-text-secondary',
          }
        : null;

  return (
    <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-text-primary">
            <FileSearch className="h-5 w-5" aria-hidden="true" />
            <h2 className="font-semibold">{copy.title}</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void inspect()}>
          {loading ? copy.loading : analysis || errorDetails ? copy.retry : copy.action}
        </Button>
      </div>

      <div className="mt-5" aria-live="polite">
        {errorDetails ? (
          <div className="rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium text-text-primary">{copy.errorTitle}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
                {errorDetails?.requestId ? (
                  <p className="mt-2 break-all font-mono text-xs text-text-muted">{copy.supportCode}: {errorDetails.requestId}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : presentation ? (
          <div className={`rounded-xl border p-4 ${presentation.className}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">{presentation.icon}</span>
              <div className="min-w-0">
                <p className="font-medium text-text-primary">{presentation.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{presentation.body}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">{copy.privacy}</p>
    </Surface>
  );
}
