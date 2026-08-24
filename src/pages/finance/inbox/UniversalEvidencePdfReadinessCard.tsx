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
  type UniversalEvidencePdfTextExtraction,
} from '@/src/services/universalEvidenceInboxService';
import { normalizeInboxEvidenceState } from './inboxModel';
import { PDF_READINESS_COPY } from './pdfReadinessCopy';
import { PDF_TEXT_COPY } from './pdfTextCopy';

type Props = {
  evidence: UniversalEvidenceDetail;
};

export function UniversalEvidencePdfReadinessCard({ evidence }: Props) {
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = PDF_READINESS_COPY[language];
  const textCopy = PDF_TEXT_COPY[language];
  const [analysis, setAnalysis] = useState<UniversalEvidencePdfReadinessResponse['analysis'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [extraction, setExtraction] = useState<UniversalEvidencePdfTextExtraction | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textErrorDetails, setTextErrorDetails] = useState<any | null>(null);
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
    setExtraction(null);
    setTextErrorDetails(null);
    setTextLoading(false);
  }, [accessState.organizationId, activeFinanceEntityId, evidence.evidenceId]);

  if (!eligible) return null;

  const inspect = async () => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId) return;

    const epoch = ++epochRef.current;
    setLoading(true);
    setErrorDetails(null);
    setExtraction(null);
    setTextErrorDetails(null);
    setTextLoading(false);

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

  const readNativeText = async () => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId) return;

    const epoch = ++epochRef.current;
    setTextLoading(true);
    setTextErrorDetails(null);
    setExtraction(null);

    try {
      const response = await universalEvidenceInboxService.extractPdfNativeText(
        organizationId,
        activeFinanceEntityId,
        evidence.evidenceId,
      );
      if (epoch !== epochRef.current) return;
      setExtraction(response.extraction);
    } catch (error: any) {
      if (epoch !== epochRef.current) return;
      setExtraction(null);
      setTextErrorDetails(error?.details || { error: error?.message });
    } finally {
      if (epoch !== epochRef.current) return;
      setTextLoading(false);
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

  const canExtract =
    analysis?.textLayerState === 'detected' &&
    analysis.encrypted === false &&
    analysis.unsupportedStreams === 0 &&
    analysis.limited === false;

  const textErrorBody = textErrorDetails?.error === 'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE'
    ? textCopy.tooLarge
    : textCopy.errorBody;

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
        <Button variant="secondary" disabled={loading || textLoading} onClick={() => void inspect()}>
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

      {canExtract ? (
        <div className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-relaxed text-text-muted">{textCopy.privacy}</p>
            <Button variant="secondary" disabled={textLoading || loading} onClick={() => void readNativeText()}>
              {textLoading ? textCopy.loading : extraction || textErrorDetails ? textCopy.retry : textCopy.action}
            </Button>
          </div>

          <div className="mt-4" aria-live="polite">
            {textErrorDetails ? (
              <div className="rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4">
                <p className="font-medium text-text-primary">{textCopy.errorTitle}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{textErrorBody}</p>
                {textErrorDetails?.requestId ? (
                  <p className="mt-2 break-all font-mono text-xs text-text-muted">{textCopy.supportCode}: {textErrorDetails.requestId}</p>
                ) : null}
              </div>
            ) : extraction?.state === 'unavailable' ? (
              <div className="rounded-xl border border-border-subtle bg-surface-secondary p-4">
                <p className="font-medium text-text-primary">{textCopy.unavailableTitle}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{textCopy.reasons[extraction.reason]}</p>
              </div>
            ) : extraction?.state === 'extracted' ? (
              <div className="rounded-xl border border-border-subtle bg-surface-secondary p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <p className="font-medium text-text-primary">{textCopy.extractedTitle}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{textCopy.extractedBody}</p>
                  </div>
                  <p className="shrink-0 text-xs text-text-muted">
                    {textCopy.metadata(extraction.extractedPages, extraction.totalPages, extraction.characters)}
                  </p>
                </div>
                {extraction.truncated ? (
                  <p className="mt-3 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-xs leading-relaxed text-text-muted">{textCopy.truncated}</p>
                ) : null}
                <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-border-subtle bg-surface-base p-4">
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{extraction.text}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-text-muted">{copy.privacy}</p>
    </Surface>
  );
}
