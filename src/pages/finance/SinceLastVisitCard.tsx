import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { Surface } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import {
  financeLastVisitService,
  type SinceLastVisitSummary,
} from '@/src/services/financeLastVisitService';

const COPY: Record<Language, {
  title: string;
  none: string;
  one: string;
  many: (count: number) => string;
  more: string;
  safe: string;
}> = {
  PT: {
    title: 'Desde sua última visita',
    none: 'Nada novo foi registrado nesta entidade.',
    one: '1 nova atividade financeira foi registrada.',
    many: (count) => `${count} novas atividades financeiras foram registradas.`,
    more: 'Há mais mudanças além das mostradas nesta visão rápida.',
    safe: 'Esta é uma leitura do histórico canônico; não altera nenhum dado.',
  },
  EN: {
    title: 'Since your last visit',
    none: 'Nothing new was recorded for this entity.',
    one: '1 new finance activity was recorded.',
    many: (count) => `${count} new finance activities were recorded.`,
    more: 'There are more changes than this quick view displays.',
    safe: 'This reads canonical history only; it does not change any data.',
  },
  ES: {
    title: 'Desde tu última visita',
    none: 'No se registró nada nuevo en esta entidad.',
    one: 'Se registró 1 nueva actividad financiera.',
    many: (count) => `Se registraron ${count} nuevas actividades financieras.`,
    more: 'Hay más cambios de los que muestra esta vista rápida.',
    safe: 'Esta es una lectura del historial canónico; no modifica ningún dato.',
  },
};

export function SinceLastVisitCard({
  organizationId,
  financeEntityId,
}: {
  organizationId: string;
  financeEntityId: string;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [summary, setSummary] = useState<SinceLastVisitSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId || !financeEntityId) {
      setSummary(null);
      return;
    }

    const previous = financeLastVisitService.previous(organizationId, financeEntityId);
    const now = new Date();

    if (!previous) {
      financeLastVisitService.touch(organizationId, financeEntityId, now);
      setSummary(null);
      return;
    }

    void financeLastVisitService
      .summary(organizationId, financeEntityId, previous)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) financeLastVisitService.touch(organizationId, financeEntityId, now);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, financeEntityId]);

  if (!summary) return null;

  const message =
    summary.total === 0
      ? copy.none
      : summary.total === 1
        ? copy.one
        : copy.many(summary.total);

  return (
    <Surface variant="secondary" radius="lg" className="p-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{copy.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{message}</p>
          {summary.hasMoreThanPreview ? (
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.more}</p>
          ) : null}
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.safe}</p>
        </div>
      </div>
    </Surface>
  );
}
