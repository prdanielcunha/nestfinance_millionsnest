import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import type {
  ReconciliationExceptionCandidate,
  ReconciliationLineMatchPreview,
} from '../../../../shared/finance/reconciliationMatchPreview.js';

type Props = {
  lines: ReconciliationLineMatchPreview[];
  language: Language;
};

type Copy = {
  title: (count: number) => string;
  body: string;
  source: string;
  possibleMatch: string;
  noPossibleMatch: string;
  amountDifference: (cents: number) => string;
  dateDifference: (days: number) => string;
  sameDate: string;
  reviewAction: string;
  missingAction: string;
  openTransaction: string;
  candidateLimit: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: (count) =>
      count === 1
        ? 'Encontramos 1 item que não bate'
        : `Encontramos ${count} itens que não batem`,
    body: 'Mostramos primeiro as divergências. As possíveis correspondências abaixo são apenas pistas determinísticas para você conferir; elas nunca são conciliadas automaticamente.',
    source: 'No extrato',
    possibleMatch: 'Possível correspondência',
    noPossibleMatch: 'Nenhuma movimentação próxima foi encontrada',
    amountDifference: (cents) =>
      cents === 0
        ? 'Mesmo valor'
        : `Diferença de valor: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'PT')}`,
    dateDifference: (days) =>
      days === 0
        ? 'Mesma data'
        : `Diferença de data: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'} ${days > 0 ? 'depois' : 'antes'}`,
    sameDate: 'Mesma data',
    reviewAction: 'Ação sugerida: abra a movimentação e confira a diferença antes de corrigir qualquer dado.',
    missingAction: 'Ação sugerida: procure uma movimentação ausente ou registre uma nova somente depois de conferir o extrato.',
    openTransaction: 'Abrir movimentação',
    candidateLimit: 'Há outras possibilidades próximas. Revise antes de decidir.',
  },
  EN: {
    title: (count) =>
      count === 1
        ? 'We found 1 item that does not match'
        : `We found ${count} items that do not match`,
    body: 'Exceptions are shown first. The possible matches below are deterministic review clues only; they are never reconciled automatically.',
    source: 'On the statement',
    possibleMatch: 'Possible match',
    noPossibleMatch: 'No nearby recorded transaction was found',
    amountDifference: (cents) =>
      cents === 0
        ? 'Same amount'
        : `Amount difference: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'EN')}`,
    dateDifference: (days) =>
      days === 0
        ? 'Same date'
        : `Date difference: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days > 0 ? 'later' : 'earlier'}`,
    sameDate: 'Same date',
    reviewAction: 'Suggested action: open the transaction and review the difference before correcting any data.',
    missingAction: 'Suggested action: look for a missing transaction or record a new one only after checking the statement.',
    openTransaction: 'Open transaction',
    candidateLimit: 'There are additional nearby possibilities. Review them before deciding.',
  },
  ES: {
    title: (count) =>
      count === 1
        ? 'Encontramos 1 elemento que no coincide'
        : `Encontramos ${count} elementos que no coinciden`,
    body: 'Las divergencias aparecen primero. Las posibles correspondencias son solo pistas determinísticas para revisión; nunca se concilian automáticamente.',
    source: 'En el extracto',
    possibleMatch: 'Posible correspondencia',
    noPossibleMatch: 'No se encontró un movimiento registrado cercano',
    amountDifference: (cents) =>
      cents === 0
        ? 'Mismo valor'
        : `Diferencia de valor: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'ES')}`,
    dateDifference: (days) =>
      days === 0
        ? 'Misma fecha'
        : `Diferencia de fecha: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'} ${days > 0 ? 'después' : 'antes'}`,
    sameDate: 'Misma fecha',
    reviewAction: 'Acción sugerida: abre el movimiento y revisa la diferencia antes de corregir cualquier dato.',
    missingAction: 'Acción sugerida: busca un movimiento faltante o registra uno nuevo solo después de revisar el extracto.',
    openTransaction: 'Abrir movimiento',
    candidateLimit: 'Hay otras posibilidades cercanas. Revísalas antes de decidir.',
  },
};

function localeFor(language: Language) {
  return language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
}

function formatMoney(cents: number, language: Language) {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDate(value: string, language: Language) {
  const date = new Date(value + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function CandidateCard({
  candidate,
  language,
  copy,
}: {
  candidate: ReconciliationExceptionCandidate;
  language: Language;
  copy: Copy;
  key?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {copy.possibleMatch}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-text-primary">
            {candidate.description || candidate.transactionId}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {formatDate(candidate.occurredAt, language)} · {formatMoney(candidate.amountCents, language)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-2 py-1 text-[10px] font-medium text-semantic-warning">
              {copy.amountDifference(candidate.amountDifferenceCents)}
            </span>
            <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-2 py-1 text-[10px] font-medium text-semantic-warning">
              {candidate.dateOffsetDays === 0
                ? copy.sameDate
                : copy.dateDifference(candidate.dateOffsetDays)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{copy.reviewAction}</p>
        </div>
        <Button
          variant="ghost"
          className="shrink-0"
          onClick={() =>
            navigate(
              APP_ROUTES.transactionDetail.replace(
                ':transactionId',
                candidate.transactionId,
              ),
            )
          }
        >
          {copy.openTransaction}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function ReconciliationExceptionsPanel({ lines, language }: Props) {
  const copy = COPY[language];
  const exceptions = lines.filter((line) => line.state === 'no_candidate');

  if (exceptions.length === 0) return null;

  return (
    <Surface
      variant="secondary"
      radius="xl"
      className="border border-semantic-warning/20 p-4 sm:p-5"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h5 className="text-base font-semibold tracking-tight text-text-primary">
            {copy.title(exceptions.length)}
          </h5>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-muted">
            {copy.body}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {exceptions.map((line) => (
          <div
            key={line.lineNumber}
            className="rounded-xl border border-border-subtle bg-surface-secondary/50 p-3 sm:p-4"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {copy.source}
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {line.sourceDescription || '—'}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {formatDate(line.sourceDate, language)} · {formatMoney(line.sourceAmountCents, language)}
              </p>
            </div>

            {(line.exceptionCandidates?.length || 0) > 0 ? (
              <div className="mt-3 space-y-2">
                {(line.exceptionCandidates || []).map((candidate) => (
                  <CandidateCard
                    key={candidate.transactionId}
                    candidate={candidate}
                    language={language}
                    copy={copy}
                  />
                ))}
                {line.exceptionCandidateLimitReached ? (
                  <p className="text-[11px] leading-relaxed text-text-muted">
                    {copy.candidateLimit}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-border-subtle bg-surface-base p-3">
                <p className="text-sm font-medium text-text-primary">{copy.noPossibleMatch}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{copy.missingAction}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Surface>
  );
}
