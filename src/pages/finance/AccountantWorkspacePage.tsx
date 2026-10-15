import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, FileSpreadsheet, FileText, Landmark, ShieldCheck, ChevronRight } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FinanceScreenHero } from '@/src/components/finance/FinanceScreenHero';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { AccountantPackagePanel } from './AccountantPackagePanel';

const COPY = {
  PT: {
    area: 'Espaço do contador', title: 'Espaço do contador',
    subtitle: 'Relatórios organizados para prestação de contas.',
    back: 'Voltar', period: 'Período', reports: 'Relatórios disponíveis',
    finance: 'Resumo financeiro do mês', financeSub: 'Entradas, despesas, pendências e situação do período',
    moves: 'Extrato de movimentações', movesSub: 'Entradas, saídas, transferências e filtros',
    bank: 'Conciliação bancária', bankSub: 'Contas e extratos preparados para conferência',
    audit: 'Auditoria e rastreabilidade', auditSub: 'Quem registrou, alterou ou conferiu, e quando',
    packageTitle: 'Pacote mensal', packageHint: 'Exporte os arquivos disponíveis para o contador. Documentos originais ainda não são incluídos automaticamente.',
    note: 'A exportação atual reúne arquivos CSV e índices. PDF contábil certificado, Excel nativo e fechamento definitivo ainda não foram habilitados.',
    noEntity: 'Escolha uma igreja para consultar e exportar somente os dados autorizados.',
  },
  EN: {
    area: 'Accountant workspace', title: 'Accountant workspace',
    subtitle: 'Organized reports for financial accountability.',
    back: 'Back', period: 'Period', reports: 'Available reports',
    finance: 'Monthly financial summary', financeSub: 'Income, expenses, outstanding items and monthly readiness',
    moves: 'Transaction statement', movesSub: 'Income, expenses, transfers and filters',
    bank: 'Bank reconciliation', bankSub: 'Accounts and statements prepared for verification',
    audit: 'Audit and traceability', auditSub: 'Who recorded, changed or reviewed an item, and when',
    packageTitle: 'Monthly package', packageHint: 'Export available files for the accountant. Original documents are not yet automatically bundled.',
    note: 'Current exports include CSV files and indexes. Certified financial PDF, native Excel and final month closing are not enabled.',
    noEntity: 'Select a church to view and export authorized data only.',
  },
  ES: {
    area: 'Espacio del contador', title: 'Espacio del contador',
    subtitle: 'Informes organizados para rendición de cuentas.',
    back: 'Volver', period: 'Período', reports: 'Informes disponibles',
    finance: 'Resumen financiero mensual', financeSub: 'Ingresos, gastos, pendientes y estado del período',
    moves: 'Extracto de movimientos', movesSub: 'Ingresos, gastos, transferencias y filtros',
    bank: 'Conciliación bancaria', bankSub: 'Cuentas y extractos preparados para revisión',
    audit: 'Auditoría y trazabilidad', auditSub: 'Quién registró, modificó o revisó, y cuándo',
    packageTitle: 'Paquete mensual', packageHint: 'Exporta los archivos disponibles para el contador. Los documentos originales aún no se adjuntan automáticamente.',
    note: 'Las exportaciones actuales contienen CSV e índices. PDF contable certificado, Excel nativo y cierre definitivo todavía no están habilitados.',
    noEntity: 'Selecciona una iglesia para consultar y exportar solamente datos autorizados.',
  },
} as const;

function currentMonth() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0')].join('-');
}

function AccountantWorkspaceContent() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const [period, setPeriod] = useState(currentMonth);
  const copy = COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const reports = [
    { title: copy.finance, subtitle: copy.financeSub, icon: FileText, route: APP_ROUTES.reports },
    { title: copy.moves, subtitle: copy.movesSub, icon: FileSpreadsheet, route: APP_ROUTES.transactions },
    { title: copy.bank, subtitle: copy.bankSub, icon: Landmark, route: APP_ROUTES.balance },
    { title: copy.audit, subtitle: copy.auditSub, icon: ShieldCheck, route: APP_ROUTES.audit },
  ];

  return (
    <main className="mx-auto max-w-5xl pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />
      <FinanceScreenHero title={copy.title} subtitle={copy.subtitle} onBack={() => navigate(APP_ROUTES.more)} backLabel={copy.back}>
        <label className="block max-w-sm text-sm font-semibold text-[#f0ca8b]">
          {copy.period}
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)}
            className="mt-2 min-h-14 w-full rounded-xl border border-[#cbd1cc] bg-white px-4 text-base font-semibold text-[#17242c] focus-visible:outline-[#e7bc78]" />
        </label>
      </FinanceScreenHero>
      <div className="space-y-5 px-3 pt-5 sm:px-6">
        <section className="nf-paper-surface overflow-hidden rounded-2xl" aria-labelledby="accountant-reports-heading">
          <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
            <ClipboardList className="h-6 w-6 text-accent-primary" aria-hidden="true" />
            <h2 id="accountant-reports-heading" className="text-lg font-semibold text-text-primary">{copy.reports}</h2>
          </div>
          <div className="divide-y divide-border-subtle">
            {reports.map((report) => <button type="button" key={report.route} onClick={() => navigate(report.route)}
              className="nf-interactive flex min-h-20 w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-secondary">
              <report.icon className="h-6 w-6 shrink-0 text-accent-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-text-primary">{report.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{report.subtitle}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            </button>)}
          </div>
        </section>
        <section aria-labelledby="accountant-package-heading">
          <h2 id="accountant-package-heading" className="mb-2 text-xl font-semibold text-text-primary">{copy.packageTitle}</h2>
          <p className="mb-4 text-base leading-relaxed text-text-secondary">{copy.packageHint}</p>
          {organizationId && activeFinanceEntityId ? (
            <AccountantPackagePanel key={organizationId + ':' + activeFinanceEntityId + ':' + period}
              organizationId={organizationId} financeEntityId={activeFinanceEntityId} period={period} />
          ) : (
            <p className="rounded-xl border border-border-subtle bg-surface-default p-5 text-base text-text-secondary">{copy.noEntity}</p>
          )}
          <p className="mt-4 text-sm leading-relaxed text-text-muted">{copy.note}</p>
        </section>
      </div>
    </main>
  );
}

export default function AccountantWorkspacePage() {
  return <FinanceContextGuard><AccountantWorkspaceContent /></FinanceContextGuard>;
}
