import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, ListChecks, Landmark, FileArchive } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import type { Language } from '@/src/contexts/LanguageContext';
import type { PeriodCloseReadinessResponse } from '../../../shared/finance/periodCloseReadiness.js';

const COPY = {
  PT: {
    area: 'Espaço do contador',
    title: 'Confira o período com segurança',
    subtitle: 'Movimentações, documentos e pendências da igreja ativa, sem perder a origem dos valores.',
    attention: (n: number) => n === 1 ? '1 pendência operacional precisa de revisão' : `${n} pendências operacionais precisam de revisão`,
    noAttention: 'Nenhum bloqueio operacional identificado no alcance verificado',
    month: 'Período',
    review: 'Conferência e classificação',
    reviewBody: 'Decida o que precisa ser corrigido antes da aprovação.',
    reviewUnavailable: 'Seu acesso não permite conferir ou aprovar movimentações.',
    transactions: 'Movimentações e histórico',
    transactionsBody: 'Abra registros, origens, evidências e correções permitidas.',
    bank: 'Conferir com o banco',
    bankBody: 'Veja os extratos identificados e as pendências de conciliação.',
    package: 'Preparar pacote mensal',
    packageBody: 'Baixe CSVs e índices autorizados para enviar ao contador.',
    accounting: 'Diário, razão e balancete',
    accountingBody: 'Consulte os livros dos lançamentos contabilizados. A preparação financeira e a conferência dos saldos iniciais são necessárias.',
    notOfficial: 'Esta é uma visão operacional. Ela não declara fechamento, contabilização oficial nem conformidade fiscal.',
    trail: 'Rastreie cada valor',
    trailBody: 'Relatório → movimentação → documentos e histórico disponível.',
    open: 'Abrir',
    notAvailable: 'Ainda não disponível',
  },
  EN: {
    area: 'Accountant workspace',
    title: 'Review the period safely',
    subtitle: 'Transactions, documents and open issues for this church, keeping their sources traceable.',
    attention: (n: number) => n === 1 ? '1 operational issue requires review' : `${n} operational issues require review`,
    noAttention: 'No operational blocker found within the verified scope',
    month: 'Period',
    review: 'Review and classification',
    reviewBody: 'Resolve what needs correction before approval.',
    reviewUnavailable: 'Your account cannot review or approve transactions.',
    transactions: 'Transactions and history',
    transactionsBody: 'Open records, evidence, sources and allowed corrections.',
    bank: 'Check with the bank',
    bankBody: 'Review identified statements and reconciliation work.',
    package: 'Prepare monthly package',
    packageBody: 'Download authorized CSVs and indexes for your accountant.',
    accounting: 'Journal, general ledger and trial balance',
    accountingBody: 'Consult the books of posted entries. Financial preparation and verified opening balances are required.',
    notOfficial: 'This is an operational view, not an official close, accounting certification or tax-compliance statement.',
    trail: 'Trace each amount',
    trailBody: 'Report → transaction → available evidence and history.',
    open: 'Open',
    notAvailable: 'Not yet available',
  },
  ES: {
    area: 'Espacio del contador',
    title: 'Revisa el período con seguridad',
    subtitle: 'Movimientos, documentos y pendientes de la iglesia activa, sin perder el origen de los importes.',
    attention: (n: number) => n === 1 ? '1 pendiente operativo requiere revisión' : `${n} pendientes operativos requieren revisión`,
    noAttention: 'No se encontraron bloqueos operativos en el alcance verificado',
    month: 'Período',
    review: 'Revisión y clasificación',
    reviewBody: 'Resuelve lo que requiere corrección antes de aprobar.',
    reviewUnavailable: 'Tu acceso no permite revisar ni aprobar movimientos.',
    transactions: 'Movimientos e historial',
    transactionsBody: 'Abre registros, evidencias, orígenes y correcciones permitidas.',
    bank: 'Comprobar con el banco',
    bankBody: 'Consulta extractos identificados y pendientes de conciliación.',
    package: 'Preparar paquete mensual',
    packageBody: 'Descarga archivos CSV e índices autorizados para el contador.',
    accounting: 'Diario, libro mayor y balance de comprobación',
    accountingBody: 'Consulte los libros de asientos contabilizados. Se requieren preparación financiera y saldos iniciales verificados.',
    notOfficial: 'Esta es una vista operativa, no un cierre oficial, certificación contable ni garantía de cumplimiento fiscal.',
    trail: 'Rastrea cada importe',
    trailBody: 'Informe → movimiento → evidencias e historial disponibles.',
    open: 'Abrir',
    notAvailable: 'Aún no disponible',
  },
} as const;

type Props = {
  language: Language;
  period: string;
  readiness: PeriodCloseReadinessResponse;
  canReview: boolean;
};

export function AccountantWorkspaceOverview({ language, period, readiness, canReview, canReadBooks = false }: Props & { canReadBooks?: boolean }) {
  const copy = COPY[language];
  const navigate = useNavigate();
  const issues = readiness.readiness.blockerCount;
  const rows = [
    { id: 'transactions', title: copy.transactions, body: copy.transactionsBody, icon: FileText, route: APP_ROUTES.transactions, available: true },
    { id: 'review', title: copy.review, body: canReview ? copy.reviewBody : copy.reviewUnavailable, icon: ListChecks, route: APP_ROUTES.review, available: canReview },
    { id: 'bank', title: copy.bank, body: copy.bankBody, icon: Landmark, route: APP_ROUTES.balance, available: true },
    { id: 'package', title: copy.package, body: copy.packageBody, icon: FileArchive, route: '', available: true },
    { id: 'accounting', title: copy.accounting, body: copy.accountingBody, icon: FileText, route: '', available: canReadBooks },
  ];

  const openRow = (row: typeof rows[number]) => {
    if (!row.available) return;
    if (row.id === 'accounting') {
      document.getElementById('certified-book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (row.id === 'package') {
      document.getElementById('accountant-package')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(row.route);
  };

  return (
    <section aria-labelledby="accountant-overview-heading" className="nf-spec-paper overflow-hidden rounded-[1.75rem] border border-border-strong bg-surface-default">
      <header className="px-5 pt-7 pb-5 sm:px-8">
        <p className="text-sm font-semibold text-text-secondary">{copy.area} · {copy.month} {period}</p>
        <h2 id="accountant-overview-heading" className="mt-2 text-[1.7rem] font-semibold leading-tight tracking-tight text-text-primary">{copy.title}</h2>
        <p className="mt-2 text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
      </header>
      <p className="mx-5 rounded-lg bg-semantic-warning/10 px-4 py-3 text-sm font-medium text-text-primary sm:mx-8" role="status">
        {issues > 0 ? copy.attention(issues) : copy.noAttention}
      </p>
      <div className="mx-5 mt-5 divide-y divide-border-subtle border-y border-border-subtle sm:mx-8">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <button
              key={row.id}
              type="button"
              disabled={!row.available}
              onClick={() => openRow(row)}
              className="nf-interactive flex min-h-[5.25rem] w-full items-center gap-4 px-1 py-4 text-left hover:bg-surface-secondary focus-visible:rounded-lg disabled:cursor-not-allowed disabled:opacity-65"
            >
              <Icon className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-text-primary">{row.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{row.body}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-accent-primary">{row.available ? copy.open : copy.notAvailable}</span>
              {row.available ? <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <footer className="bg-surface-secondary/60 px-5 py-5 sm:px-8">
        <h3 className="font-semibold text-text-primary">{copy.trail}</h3>
        <p className="mt-1 text-sm text-text-secondary">{copy.trailBody}</p>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{copy.notOfficial}</p>
      </footer>
    </section>
  );
}
