import { CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';

type Props = {
  reconciliationStatus?: string | null;
  reconciliationEvidenceId?: string | null;
  reconciledAt?: string | null;
};

type Copy = {
  title: string;
  body: string;
  dateLabel: string;
  evidenceLabel: string;
  openEvidence: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: 'Conferida com extrato',
    body: 'Esta movimentação foi ligada a um item do extrato após confirmação humana. Nenhum valor ou saldo foi alterado por essa conferência.',
    dateLabel: 'Conferida em',
    evidenceLabel: 'Fonte',
    openEvidence: 'Abrir extrato usado na conferência',
  },
  EN: {
    title: 'Checked against statement',
    body: 'This transaction was linked to a statement item after human confirmation. This check did not change any amount or balance.',
    dateLabel: 'Checked on',
    evidenceLabel: 'Source',
    openEvidence: 'Open statement used for this check',
  },
  ES: {
    title: 'Revisada con extracto',
    body: 'Este movimiento fue vinculado a un elemento del extracto después de una confirmación humana. Esta revisión no cambió ningún valor ni saldo.',
    dateLabel: 'Revisada el',
    evidenceLabel: 'Fuente',
    openEvidence: 'Abrir extracto usado en la revisión',
  },
};

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TransactionReconciliationTraceCard({
  reconciliationStatus,
  reconciliationEvidenceId,
  reconciledAt,
}: Props) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const navigate = useNavigate();

  if (reconciliationStatus !== 'reconciled') return null;

  return (
    <Surface variant="elevated" radius="xl" className="border-semantic-success/20 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-success/10 text-semantic-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{copy.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.body}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {copy.dateLabel}
              </p>
              <p className="mt-1 text-sm text-text-primary">{formatDate(reconciledAt, language)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {copy.evidenceLabel}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-primary">
                <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                {reconciliationEvidenceId ? copy.title : '—'}
              </p>
            </div>
          </div>

          {reconciliationEvidenceId ? (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() =>
                navigate(
                  APP_ROUTES.inboxEvidenceDetail.replace(
                    ':evidenceId',
                    reconciliationEvidenceId,
                  ),
                )
              }
            >
              {copy.openEvidence}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
