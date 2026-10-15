import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import type { Language } from '@/src/contexts/LanguageContext';
import type { CountSessionListItem } from '@/src/services/countService';

const COPY = {
  PT: {
    title: 'Contagens conferidas pela equipe',
    body: 'Os cultos abaixo já têm conferência concluída. A tesouraria aproveita a origem e as evidências existentes, sem digitar os mesmos valores novamente.',
    action: 'Conferir na tesouraria',
    view: 'Ver contagem e origem',
    note: 'Só uma confirmação explícita cria propostas de movimentação. Se elas já existem, o NestFinance reutiliza o vínculo e não duplica a entrada.',
  },
  EN: {
    title: 'Counts checked by the team',
    body: 'These services have a completed count. Treasury can reuse existing sources and evidence without retyping the amounts.',
    action: 'Review in treasury',
    view: 'See count and source',
    note: 'Only explicit confirmation creates proposed transactions. Existing proposals keep their links and cannot be duplicated.',
  },
  ES: {
    title: 'Conteos revisados por el equipo',
    body: 'Estos cultos ya tienen conteo revisado. Tesorería reutiliza el origen y las evidencias sin escribir otra vez los importes.',
    action: 'Revisar en tesorería',
    view: 'Ver conteo y origen',
    note: 'Las propuestas solo se crean por confirmación explícita. Las existentes conservan sus vínculos sin duplicar el ingreso.',
  },
} as const;

export function CountTreasuryHandoffCard({
  language,
  counts,
  canPrepare,
}: {
  language: Language;
  counts: CountSessionListItem[];
  canPrepare: boolean;
}) {
  const navigate = useNavigate();
  const copy = COPY[language];
  const matched = counts.filter((count) => count.status === 'matched').slice(0, 3);
  if (!matched.length) return null;

  return (
    <section aria-labelledby="count-treasury-handoff-title" className="rounded-3xl border border-border-subtle bg-surface-default p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-1 h-6 w-6 shrink-0 text-semantic-success" aria-hidden="true" />
        <div>
          <h2 id="count-treasury-handoff-title" className="text-lg font-semibold text-text-primary">{copy.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{copy.body}</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-border-subtle">
        {matched.map((count) => (
          <button key={count.id} type="button" onClick={() => navigate(
            canPrepare
              ? APP_ROUTES.countProposal.replace(':sessionId', count.id)
              : APP_ROUTES.countSession.replace(':sessionId', count.id),
          )} className="nf-interactive flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left hover:bg-surface-secondary">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-text-primary">{count.serviceLabel}</span>
              <span className="mt-1 block text-sm text-text-muted">{count.serviceDate}</span>
            </span>
            <span className="max-w-32 text-right text-sm font-semibold text-accent-primary">{canPrepare ? copy.action : copy.view}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{copy.note}</p>
    </section>
  );
}
