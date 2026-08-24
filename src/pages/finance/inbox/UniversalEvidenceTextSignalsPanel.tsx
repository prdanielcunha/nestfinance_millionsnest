import { useState } from 'react';
import { SearchCheck } from 'lucide-react';
import { Button } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import {
  detectDocumentTextSignals,
  type DocumentTextSignalsResult,
} from '../../../../shared/finance/documentIntelligenceTextSignals.js';
import { PDF_SIGNALS_COPY } from './pdfSignalsCopy';

type Props = {
  text: string;
};

export function UniversalEvidenceTextSignalsPanel({ text }: Props) {
  const { language } = useLanguage();
  const copy = PDF_SIGNALS_COPY[language];
  const [signals, setSignals] = useState<DocumentTextSignalsResult | null>(null);

  const analyzeSignals = () => {
    setSignals(detectDocumentTextSignals(text));
  };

  return (
    <div className="mt-5 border-t border-border-subtle pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-text-primary">
            <SearchCheck className="h-5 w-5" aria-hidden="true" />
            <h3 className="font-medium">{copy.title}</h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
        </div>
        <Button variant="secondary" onClick={analyzeSignals}>
          {signals ? copy.retry : copy.action}
        </Button>
      </div>

      <div className="mt-4" aria-live="polite">
        {signals ? (
          signals.candidates.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
              <p className="font-medium text-text-primary">{copy.emptyTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.emptyBody}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
              <p className="font-medium text-text-primary">{copy.foundTitle(signals.candidates.length)}</p>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.foundBody}</p>

              {signals.inputCharacters > signals.scannedCharacters ? (
                <p className="mt-3 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2 text-xs leading-relaxed text-text-muted">{copy.inputLimited}</p>
              ) : null}
              {signals.candidateLimitReached ? (
                <p className="mt-3 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2 text-xs leading-relaxed text-text-muted">{copy.candidateLimited}</p>
              ) : null}

              <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
                {signals.candidates.map((candidate) => (
                  <div
                    key={`${candidate.kind}:${candidate.start}:${candidate.end}:${candidate.normalized}`}
                    className="rounded-lg border border-border-subtle bg-surface-secondary p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-primary">
                        {copy.kinds[candidate.kind]}
                      </span>
                      <span className="text-xs text-text-muted">{copy.evidence[candidate.evidence]}</span>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-text-muted">{copy.rawLabel}</p>
                      <p className="mt-1 break-words font-mono text-sm text-text-primary">{candidate.raw}</p>
                    </div>
                    {candidate.context && candidate.context !== candidate.raw ? (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-text-muted">{copy.contextLabel}</p>
                        <p className="mt-1 break-words text-sm leading-relaxed text-text-secondary">{candidate.context}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">{copy.privacy}</p>
    </div>
  );
}
