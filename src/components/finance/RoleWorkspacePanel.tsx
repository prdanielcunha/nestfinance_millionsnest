import {
  AlertTriangle,
  ArrowDownLeft,
  BarChart3,
  CheckCircle2,
  FileCheck2,
  FilePenLine,
  Inbox,
  Landmark,
  ListChecks,
  Receipt,
  Settings,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Surface } from '@/src/components/foundation';
import { APP_ROUTES } from '@/src/app/router/routes';
import type { FinanceExperienceMode } from '@/src/lib/financeExperience';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import {
  buildTodayWorkspace,
  type TodayWorkspaceAuthority,
  type TodayWorkspaceSnapshot,
  type TodayWorkspaceTaskKind,
  type TodayWorkspaceShortcutKind,
} from '@/src/pages/finance/todayWorkspaceModel';

type Props = {
  mode: FinanceExperienceMode;
  entityName: string | null;
  snapshot: TodayWorkspaceSnapshot;
  authority: TodayWorkspaceAuthority;
};

type ModeCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  focusTitle: string;
  shortcutsTitle: string;
};

const MODE_COPY: Record<Language, Record<FinanceExperienceMode, ModeCopy>> = {
  PT: {
    ecosystem: {
      eyebrow: 'Visão executiva local',
      title: 'Operação desta organização',
      subtitle: 'Acompanhe gargalos, fila da equipe e estrutura financeira sem perder a visão do ecossistema.',
      emptyTitle: 'A operação local está sob controle',
      emptyText: 'Não há tarefas acionáveis abertas nesta entidade agora.',
      focusTitle: 'O que merece atenção',
      shortcutsTitle: 'Gestão e acompanhamento',
    },
    organization_admin: {
      eyebrow: 'Administração financeira',
      title: 'Sua operação, sem caça ao menu',
      subtitle: 'Veja primeiro o que está travando a equipe e depois entre direto na área certa.',
      emptyTitle: 'A equipe está em dia',
      emptyText: 'Não há gargalos acionáveis abertos nesta entidade agora.',
      focusTitle: 'Fila da equipe',
      shortcutsTitle: 'Gestão da organização',
    },
    review: {
      eyebrow: 'Conferência',
      title: 'Sua fila de revisão',
      subtitle: 'Tudo que precisa ser conferido ou aprovado aparece aqui antes do restante.',
      emptyTitle: 'Sua fila está limpa',
      emptyText: 'Não há itens aguardando sua conferência agora.',
      focusTitle: 'Próximas conferências',
      shortcutsTitle: 'Acesso rápido',
    },
    operation: {
      eyebrow: 'Operação financeira',
      title: 'Seu trabalho de hoje',
      subtitle: 'Continue correções, rascunhos, documentos e contagens sem precisar descobrir onde ir.',
      emptyTitle: 'Nada pendente no seu turno',
      emptyText: 'Você pode registrar uma nova movimentação ou capturar um comprovante.',
      focusTitle: 'O que você precisa concluir',
      shortcutsTitle: 'Registrar e continuar',
    },
    read_only: {
      eyebrow: 'Consulta financeira',
      title: 'Visão da entidade',
      subtitle: 'Consulte movimentações, saldos, relatórios e auditoria sem ações de edição.',
      emptyTitle: 'Sem ações atribuídas ao seu perfil',
      emptyText: 'Seu espaço é de consulta. Os dados continuam disponíveis nos atalhos abaixo.',
      focusTitle: 'Resumo',
      shortcutsTitle: 'Consultar',
    },
  },
  EN: {
    ecosystem: {
      eyebrow: 'Local executive view',
      title: 'This organization’s operation',
      subtitle: 'Track bottlenecks, team queues, and finance structure without losing the ecosystem view.',
      emptyTitle: 'Local operations are under control',
      emptyText: 'There are no actionable items open for this entity right now.',
      focusTitle: 'What needs attention',
      shortcutsTitle: 'Manage and monitor',
    },
    organization_admin: {
      eyebrow: 'Finance administration',
      title: 'Your operation, without menu hunting',
      subtitle: 'See what is blocking the team first, then jump straight to the right area.',
      emptyTitle: 'The team is caught up',
      emptyText: 'There are no actionable bottlenecks open for this entity right now.',
      focusTitle: 'Team queue',
      shortcutsTitle: 'Organization management',
    },
    review: {
      eyebrow: 'Review',
      title: 'Your review queue',
      subtitle: 'Everything waiting for your review or approval appears here before the rest.',
      emptyTitle: 'Your queue is clear',
      emptyText: 'There is nothing waiting for your review right now.',
      focusTitle: 'Next reviews',
      shortcutsTitle: 'Quick access',
    },
    operation: {
      eyebrow: 'Finance operations',
      title: 'Your work today',
      subtitle: 'Continue corrections, drafts, documents, and counts without figuring out where to go.',
      emptyTitle: 'Nothing pending in your shift',
      emptyText: 'You can record a new transaction or capture a receipt.',
      focusTitle: 'What you need to finish',
      shortcutsTitle: 'Record and continue',
    },
    read_only: {
      eyebrow: 'Finance view',
      title: 'Entity overview',
      subtitle: 'Consult transactions, balances, reports, and audit without editing actions.',
      emptyTitle: 'No actions are assigned to your profile',
      emptyText: 'Your workspace is read-only. Data remains available through the shortcuts below.',
      focusTitle: 'Summary',
      shortcutsTitle: 'Explore',
    },
  },
  ES: {
    ecosystem: {
      eyebrow: 'Visión ejecutiva local',
      title: 'Operación de esta organización',
      subtitle: 'Acompaña cuellos de botella, cola del equipo y estructura financiera sin perder la visión del ecosistema.',
      emptyTitle: 'La operación local está bajo control',
      emptyText: 'No hay tareas accionables abiertas en esta entidad ahora.',
      focusTitle: 'Lo que necesita atención',
      shortcutsTitle: 'Gestión y seguimiento',
    },
    organization_admin: {
      eyebrow: 'Administración financiera',
      title: 'Tu operación, sin buscar por menús',
      subtitle: 'Mira primero lo que bloquea al equipo y entra directo al área correcta.',
      emptyTitle: 'El equipo está al día',
      emptyText: 'No hay cuellos de botella accionables abiertos en esta entidad ahora.',
      focusTitle: 'Cola del equipo',
      shortcutsTitle: 'Gestión de la organización',
    },
    review: {
      eyebrow: 'Revisión',
      title: 'Tu cola de revisión',
      subtitle: 'Todo lo que espera tu revisión o aprobación aparece aquí antes que lo demás.',
      emptyTitle: 'Tu cola está limpia',
      emptyText: 'No hay elementos esperando tu revisión ahora.',
      focusTitle: 'Próximas revisiones',
      shortcutsTitle: 'Acceso rápido',
    },
    operation: {
      eyebrow: 'Operación financiera',
      title: 'Tu trabajo de hoy',
      subtitle: 'Continúa correcciones, borradores, documentos y conteos sin tener que descubrir dónde ir.',
      emptyTitle: 'Nada pendiente en tu turno',
      emptyText: 'Puedes registrar un nuevo movimiento o capturar un comprobante.',
      focusTitle: 'Lo que necesitas terminar',
      shortcutsTitle: 'Registrar y continuar',
    },
    read_only: {
      eyebrow: 'Consulta financiera',
      title: 'Visión de la entidad',
      subtitle: 'Consulta movimientos, saldos, informes y auditoría sin acciones de edición.',
      emptyTitle: 'No hay acciones asignadas a tu perfil',
      emptyText: 'Tu espacio es de consulta. Los datos siguen disponibles en los accesos de abajo.',
      focusTitle: 'Resumen',
      shortcutsTitle: 'Consultar',
    },
  },
};

const TASK_COPY: Record<Language, Record<TodayWorkspaceTaskKind, { label: (count: number) => string; action: string }>> = {
  PT: {
    returned_corrections: { label: (count) => `${count} ${count === 1 ? 'correção devolvida' : 'correções devolvidas'}`, action: 'Corrigir' },
    drafts: { label: (count) => `${count} ${count === 1 ? 'rascunho aberto' : 'rascunhos abertos'}`, action: 'Continuar' },
    transaction_review: { label: (count) => `${count} ${count === 1 ? 'movimentação para conferir' : 'movimentações para conferir'}`, action: 'Conferir' },
    approved: { label: (count) => `${count} ${count === 1 ? 'movimentação aprovada' : 'movimentações aprovadas'}`, action: 'Ver' },
    inbox_identification: { label: (count) => `${count} ${count === 1 ? 'documento para identificar' : 'documentos para identificar'}`, action: 'Identificar' },
    inbox_review: { label: (count) => `${count} ${count === 1 ? 'documento para revisar' : 'documentos para revisar'}`, action: 'Revisar' },
    count_divergence: { label: (count) => `${count} ${count === 1 ? 'contagem divergente' : 'contagens divergentes'}`, action: 'Conferir' },
    count_check: { label: (count) => `${count} ${count === 1 ? 'contagem em conferência' : 'contagens em conferência'}`, action: 'Continuar' },
  },
  EN: {
    returned_corrections: { label: (count) => `${count} returned ${count === 1 ? 'correction' : 'corrections'}`, action: 'Fix' },
    drafts: { label: (count) => `${count} open ${count === 1 ? 'draft' : 'drafts'}`, action: 'Continue' },
    transaction_review: { label: (count) => `${count} ${count === 1 ? 'transaction' : 'transactions'} to review`, action: 'Review' },
    approved: { label: (count) => `${count} approved ${count === 1 ? 'transaction' : 'transactions'}`, action: 'View' },
    inbox_identification: { label: (count) => `${count} ${count === 1 ? 'document' : 'documents'} to identify`, action: 'Identify' },
    inbox_review: { label: (count) => `${count} ${count === 1 ? 'document' : 'documents'} to review`, action: 'Review' },
    count_divergence: { label: (count) => `${count} divergent ${count === 1 ? 'count' : 'counts'}`, action: 'Check' },
    count_check: { label: (count) => `${count} ${count === 1 ? 'count' : 'counts'} in progress`, action: 'Continue' },
  },
  ES: {
    returned_corrections: { label: (count) => `${count} ${count === 1 ? 'corrección devuelta' : 'correcciones devueltas'}`, action: 'Corregir' },
    drafts: { label: (count) => `${count} ${count === 1 ? 'borrador abierto' : 'borradores abiertos'}`, action: 'Continuar' },
    transaction_review: { label: (count) => `${count} ${count === 1 ? 'movimiento para revisar' : 'movimientos para revisar'}`, action: 'Revisar' },
    approved: { label: (count) => `${count} ${count === 1 ? 'movimiento aprobado' : 'movimientos aprobados'}`, action: 'Ver' },
    inbox_identification: { label: (count) => `${count} ${count === 1 ? 'documento para identificar' : 'documentos para identificar'}`, action: 'Identificar' },
    inbox_review: { label: (count) => `${count} ${count === 1 ? 'documento para revisar' : 'documentos para revisar'}`, action: 'Revisar' },
    count_divergence: { label: (count) => `${count} ${count === 1 ? 'conteo divergente' : 'conteos divergentes'}`, action: 'Revisar' },
    count_check: { label: (count) => `${count} ${count === 1 ? 'conteo en revisión' : 'conteos en revisión'}`, action: 'Continuar' },
  },
};

const SHORTCUT_COPY: Record<Language, Record<TodayWorkspaceShortcutKind, string>> = {
  PT: {
    transactions: 'Movimentações',
    new_transaction: 'Nova movimentação',
    capture: 'Capturar comprovante',
    count: 'Contagens',
    review: 'Conferências',
    inbox: 'Documentos',
    reports: 'Relatórios',
    balance: 'Conferir saldos',
    audit: 'Auditoria',
    settings: 'Configurações',
  },
  EN: {
    transactions: 'Transactions',
    new_transaction: 'New transaction',
    capture: 'Capture receipt',
    count: 'Counts',
    review: 'Reviews',
    inbox: 'Documents',
    reports: 'Reports',
    balance: 'Check balances',
    audit: 'Audit',
    settings: 'Settings',
  },
  ES: {
    transactions: 'Movimientos',
    new_transaction: 'Nuevo movimiento',
    capture: 'Capturar comprobante',
    count: 'Conteos',
    review: 'Revisiones',
    inbox: 'Documentos',
    reports: 'Informes',
    balance: 'Revisar saldos',
    audit: 'Auditoría',
    settings: 'Configuración',
  },
};

const TASK_META: Record<TodayWorkspaceTaskKind, { route: string; icon: typeof AlertTriangle; className: string }> = {
  returned_corrections: { route: APP_ROUTES.transactions, icon: AlertTriangle, className: 'bg-semantic-warning/10 text-semantic-warning' },
  drafts: { route: APP_ROUTES.transactions, icon: FilePenLine, className: 'bg-surface-secondary text-text-secondary' },
  transaction_review: { route: APP_ROUTES.review, icon: FileCheck2, className: 'bg-accent-primary/10 text-accent-primary' },
  approved: { route: APP_ROUTES.review, icon: CheckCircle2, className: 'bg-semantic-success/10 text-semantic-success' },
  inbox_identification: { route: APP_ROUTES.inbox, icon: Inbox, className: 'bg-surface-secondary text-text-secondary' },
  inbox_review: { route: APP_ROUTES.inbox, icon: Inbox, className: 'bg-accent-primary/10 text-accent-primary' },
  count_divergence: { route: APP_ROUTES.count, icon: AlertTriangle, className: 'bg-semantic-warning/10 text-semantic-warning' },
  count_check: { route: APP_ROUTES.count, icon: ListChecks, className: 'bg-accent-primary/10 text-accent-primary' },
};

const SHORTCUT_META: Record<TodayWorkspaceShortcutKind, { route: string; icon: typeof Receipt }> = {
  transactions: { route: APP_ROUTES.transactions, icon: Receipt },
  new_transaction: { route: APP_ROUTES.transactionCreate, icon: ArrowDownLeft },
  capture: { route: APP_ROUTES.universalCapture, icon: Inbox },
  count: { route: APP_ROUTES.count, icon: ListChecks },
  review: { route: APP_ROUTES.review, icon: FileCheck2 },
  inbox: { route: APP_ROUTES.inbox, icon: Inbox },
  reports: { route: APP_ROUTES.reports, icon: BarChart3 },
  balance: { route: APP_ROUTES.balance, icon: Wallet },
  audit: { route: APP_ROUTES.audit, icon: ShieldCheck },
  settings: { route: APP_ROUTES.financeSettings, icon: Settings },
};

export function RoleWorkspacePanel({ mode, entityName, snapshot, authority }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = MODE_COPY[language][mode];
  const workspace = buildTodayWorkspace(mode, snapshot, authority);

  return (
    <Surface variant="glass" radius="xl" className="overflow-hidden">
      <div className="border-b border-border-subtle p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">{copy.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-text-primary sm:text-3xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{copy.subtitle}</p>
          </div>
          {entityName ? (
            <span className="self-start rounded-xl border border-border-subtle bg-background-base/70 px-3 py-2 text-xs font-medium text-text-secondary">
              {entityName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.35fr_0.85fr]">
        <section aria-labelledby="workspace-focus-title">
          <h2 id="workspace-focus-title" className="mb-3 text-sm font-semibold text-text-primary">{copy.focusTitle}</h2>

          {workspace.tasks.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-background-base/60 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-success/10 text-semantic-success">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{copy.emptyTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.emptyText}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {workspace.tasks.map((task) => {
                const meta = TASK_META[task.kind];
                const taskCopy = TASK_COPY[language][task.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={task.kind}
                    type="button"
                    onClick={() => navigate(meta.route)}
                    className="nf-interactive group flex min-h-[88px] items-center gap-3 rounded-2xl border border-border-subtle bg-background-base/60 p-4 text-left hover:border-border-strong hover:bg-surface-secondary"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.className}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{taskCopy.label(task.count)}</p>
                      <p className="mt-1 text-xs font-medium text-accent-primary">{taskCopy.action}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="workspace-shortcuts-title">
          <h2 id="workspace-shortcuts-title" className="mb-3 text-sm font-semibold text-text-primary">{copy.shortcutsTitle}</h2>
          <div className="grid grid-cols-2 gap-2">
            {workspace.shortcuts.map((shortcut) => {
              const meta = SHORTCUT_META[shortcut];
              const Icon = meta.icon;
              return (
                <button
                  key={shortcut}
                  type="button"
                  onClick={() => navigate(meta.route)}
                  className="nf-interactive flex min-h-[74px] flex-col items-start justify-between rounded-2xl border border-border-subtle bg-surface-default p-3.5 text-left hover:border-border-strong hover:bg-surface-secondary"
                >
                  <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <span className="mt-3 text-xs font-semibold text-text-primary">{SHORTCUT_COPY[language][shortcut]}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Surface>
  );
}
