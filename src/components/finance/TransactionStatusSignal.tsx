import { AlertCircle, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

type StatusKey =
  | 'draft'
  | 'ready_for_review'
  | 'approved_for_posting'
  | 'posted'
  | 'reversed'
  | string;

type StatusCopy = {
  label: string;
  consequence: string;
  next: string;
};

const COPY: Record<Language, Record<'draft' | 'review' | 'approved' | 'posted' | 'reversed' | 'returned' | 'other', StatusCopy>> = {
  PT: {
    draft: {
      label: 'Rascunho',
      consequence: 'Ainda não foi enviado para conferência.',
      next: 'Complete ou descarte. O saldo não muda.',
    },
    review: {
      label: 'Aguardando conferência',
      consequence: 'Outra pessoa precisa verificar os dados.',
      next: 'Confira ou corrija. O saldo não muda.',
    },
    approved: {
      label: 'Conferida — aguardando lançamento',
      consequence: 'Os dados foram aprovados, mas ainda não entraram no saldo contábil.',
      next: 'O lançamento real continua protegido até a certificação contábil.',
    },
    posted: {
      label: 'Lançada no financeiro',
      consequence: 'O lançamento foi registrado no razão financeiro.',
      next: 'Confira com o banco quando isso se aplicar.',
    },
    reversed: {
      label: 'Estornada',
      consequence: 'O efeito do lançamento anterior foi revertido.',
      next: 'Abra os detalhes para ver o motivo e o vínculo do estorno.',
    },
    returned: {
      label: 'Para corrigir',
      consequence: 'A conferência encontrou algo que precisa ser ajustado.',
      next: 'Corrija o que foi apontado e envie novamente. O saldo não muda.',
    },
    other: {
      label: 'Em andamento',
      consequence: 'Esta movimentação ainda está em processamento.',
      next: 'Abra os detalhes para ver o próximo passo.',
    },
  },
  EN: {
    draft: {
      label: 'Draft',
      consequence: 'It has not been sent for review yet.',
      next: 'Complete or discard it. The balance does not change.',
    },
    review: {
      label: 'Waiting for review',
      consequence: 'Another person needs to verify the information.',
      next: 'Review or correct it. The balance does not change.',
    },
    approved: {
      label: 'Checked — waiting for posting',
      consequence: 'The information was approved, but it has not entered the accounting balance.',
      next: 'Real posting stays protected until accounting certification.',
    },
    posted: {
      label: 'Posted to finance',
      consequence: 'The entry was recorded in the financial ledger.',
      next: 'Match it with the bank when applicable.',
    },
    reversed: {
      label: 'Reversed',
      consequence: 'The effect of the previous entry was reversed.',
      next: 'Open details to see the reason and linked reversal.',
    },
    returned: {
      label: 'Needs correction',
      consequence: 'The review found something that needs to be adjusted.',
      next: 'Fix what was flagged and send it again. The balance does not change.',
    },
    other: {
      label: 'In progress',
      consequence: 'This transaction is still being processed.',
      next: 'Open details to see the next step.',
    },
  },
  ES: {
    draft: {
      label: 'Borrador',
      consequence: 'Todavía no fue enviado a revisión.',
      next: 'Complétalo o descártalo. El saldo no cambia.',
    },
    review: {
      label: 'Esperando revisión',
      consequence: 'Otra persona necesita verificar los datos.',
      next: 'Revisa o corrige. El saldo no cambia.',
    },
    approved: {
      label: 'Revisado — esperando registro',
      consequence: 'Los datos fueron aprobados, pero todavía no entraron en el saldo contable.',
      next: 'El registro real permanece protegido hasta la certificación contable.',
    },
    posted: {
      label: 'Registrado en finanzas',
      consequence: 'El asiento fue registrado en el libro financiero.',
      next: 'Compáralo con el banco cuando corresponda.',
    },
    reversed: {
      label: 'Revertido',
      consequence: 'El efecto del registro anterior fue revertido.',
      next: 'Abre los detalles para ver el motivo y el vínculo de la reversión.',
    },
    returned: {
      label: 'Necesita corrección',
      consequence: 'La revisión encontró algo que debe ajustarse.',
      next: 'Corrige lo indicado y envíalo de nuevo. El saldo no cambia.',
    },
    other: {
      label: 'En curso',
      consequence: 'Este movimiento todavía está en proceso.',
      next: 'Abre los detalles para ver el siguiente paso.',
    },
  },
};

export function getTransactionStatusCopy(
  language: Language,
  status: StatusKey,
  returned = false,
): StatusCopy {
  if (returned) return COPY[language].returned;
  if (status === 'draft') return COPY[language].draft;
  if (status === 'ready_for_review') return COPY[language].review;
  if (status === 'approved_for_posting') return COPY[language].approved;
  if (status === 'posted') return COPY[language].posted;
  if (status === 'reversed') return COPY[language].reversed;
  return COPY[language].other;
}

export function getTransactionStatusTone(status: StatusKey, returned = false) {
  if (returned) return 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning';
  if (status === 'ready_for_review') return 'border-accent-primary/25 bg-accent-primary/10 text-accent-primary';
  if (status === 'approved_for_posting') return 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning';
  if (status === 'posted') return 'border-semantic-success/25 bg-semantic-success/10 text-semantic-success';
  if (status === 'reversed') return 'border-semantic-danger/25 bg-semantic-danger/10 text-semantic-danger';
  return 'border-border-subtle bg-surface-secondary text-text-secondary';
}

function StatusIcon({ status, returned }: { status: StatusKey; returned: boolean }) {
  const className = 'h-4 w-4 shrink-0';
  if (returned) return <AlertCircle className={className} aria-hidden="true" />;
  if (status === 'posted') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (status === 'reversed') return <RotateCcw className={className} aria-hidden="true" />;
  return <Clock3 className={className} aria-hidden="true" />;
}

export function TransactionStatusSignal({
  status,
  returned = false,
  compact = false,
  className = '',
}: {
  status: StatusKey;
  returned?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { language } = useLanguage();
  const copy = getTransactionStatusCopy(language, status, returned);
  const tone = getTransactionStatusTone(status, returned);

  return (
    <div className={className}>
      <div className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${tone}`}>
        <StatusIcon status={status} returned={returned} />
        <span>{copy.label}</span>
      </div>
      {!compact ? (
        <div className="mt-1.5 max-w-md text-xs leading-relaxed text-text-muted">
          <p>{copy.consequence}</p>
          <p className="mt-0.5">{copy.next}</p>
        </div>
      ) : null}
    </div>
  );
}
