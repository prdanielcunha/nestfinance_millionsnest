import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { formatReviewDate } from './transactionReviewModel';

type CountSource = {
  countSessionId: string;
  countVersion: number;
  countEntryType: 'tithe' | 'offering' | 'other' | 'pix';
  sourceCaptureIds: string[];
  firstCounterLabel?: string | null;
  secondCounterLabel?: string | null;
  serviceLabel?: string;
  serviceDate?: string;
};

const COPY = {
  PT: {
    eyebrow: 'Origem',
    title: 'Gerado a partir de uma contagem conferida',
    body: 'Este lançamento foi proposto pelo Count e chegou aqui para revisão humana. Nenhum valor foi contabilizado automaticamente.',
    labels: { tithe: 'Dízimos', offering: 'Ofertas', other: 'Outras entradas', pix: 'Pix' },
    service: 'Evento',
    first: 'Primeira contagem',
    second: 'Segunda contagem',
    openCount: 'Abrir contagem',
    evidence: 'Ver evidência',
  },
  EN: {
    eyebrow: 'Source',
    title: 'Generated from a verified count',
    body: 'This entry was proposed by Count and arrived here for human review. Nothing was posted automatically.',
    labels: { tithe: 'Tithes', offering: 'Offerings', other: 'Other income', pix: 'Pix' },
    service: 'Event',
    first: 'First count',
    second: 'Second count',
    openCount: 'Open count',
    evidence: 'View evidence',
  },
  ES: {
    eyebrow: 'Origen',
    title: 'Generado desde un conteo verificado',
    body: 'Este movimiento fue propuesto por Count y llegó aquí para revisión humana. Nada fue contabilizado automáticamente.',
    labels: { tithe: 'Diezmos', offering: 'Ofrendas', other: 'Otras entradas', pix: 'Pix' },
    service: 'Evento',
    first: 'Primer conteo',
    second: 'Segundo conteo',
    openCount: 'Abrir conteo',
    evidence: 'Ver evidencia',
  },
} as const;

export function CountTransactionProvenance({ countSource }: { countSource?: CountSource | null }) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];
  if (!countSource?.countSessionId) return null;

  const sourceCaptureIds = Array.isArray(countSource.sourceCaptureIds)
    ? countSource.sourceCaptureIds
    : [];

  return (
    <Surface
      variant="secondary"
      radius="xl"
      className="border-accent-primary/20 bg-accent-primary/5 p-5 sm:p-6"
    >
      <p className="nf-helper-text font-semibold uppercase tracking-[0.12em] text-text-muted">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-text-primary">{copy.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.body}</p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-base p-4">
          <dt className="nf-helper-text text-text-muted">{copy.service}</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {countSource.serviceLabel || 'Count'} · {countSource.serviceDate
              ? formatReviewDate(`${countSource.serviceDate}T12:00:00.000Z`, language)
              : '—'}
          </dd>
          <p className="mt-1 nf-helper-text text-text-muted">{copy.labels[countSource.countEntryType]}</p>
        </div>
        <div className="rounded-xl bg-surface-base p-4">
          <dt className="nf-helper-text text-text-muted">{copy.first}</dt>
          <dd className="mt-1 font-semibold text-text-primary">{countSource.firstCounterLabel || '—'}</dd>
          <dt className="mt-3 nf-helper-text text-text-muted">{copy.second}</dt>
          <dd className="mt-1 font-semibold text-text-primary">{countSource.secondCounterLabel || '—'}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', countSource.countSessionId))}
        >
          {copy.openCount}
        </Button>
        {sourceCaptureIds.map((captureId, index) => (
          <Button
            key={captureId}
            variant="secondary"
            onClick={() => navigate(APP_ROUTES.countCaptureReview.replace(':captureId', captureId))}
          >
            {copy.evidence} {index + 1}
          </Button>
        ))}
      </div>
    </Surface>
  );
}
