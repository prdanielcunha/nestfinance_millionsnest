import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  FileText,
  Landmark,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShieldX,
  Upload,
} from 'lucide-react';
import type {
  ReconciliationBankAccount,
  ReconciliationReadiness,
  ReconciliationStatementSource,
} from '../../../shared/finance/reconciliation.js';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { reconciliationService } from '@/src/services/reconciliationService';
import { ReconciliationStatementPreparationPanel } from './balance/ReconciliationStatementPreparationPanel';

type BalanceCopy = {
  area: string;
  title: string;
  subtitle: string;
  back: string;
  retry: string;
  loading: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
  errorTitle: string;
  errorBody: string;
  priorityEyebrow: string;
  configureAccountTitle: string;
  configureAccountText: string;
  configureAccountAction: string;
  needStatementTitle: string;
  needStatementText: string;
  captureStatementAction: string;
  reviewStatementTitle: string;
  reviewStatementText: string;
  reviewStatementAction: string;
  unsupportedTitle: string;
  unsupportedText: string;
  openStatement: string;
  sourceReadyTitle: string;
  sourceReadyText: string;
  summaryAccounts: string;
  summaryStatements: string;
  summaryPending: string;
  summaryReady: string;
  accountsTitle: string;
  accountsText: string;
  statementsTitle: string;
  statementsText: string;
  noAccounts: string;
  noStatements: string;
  eligible: string;
  needsSetup: string;
  institutionFallback: string;
  accountEnding: (last4: string) => string;
  accountType: Record<string, string>;
  statementPending: string;
  statementReady: string;
  statementUnsupported: string;
  received: string;
  reviewed: string;
  notReviewed: string;
  open: string;
  trustTitle: string;
  trustText: string;
};

const COPY: Record<Language, BalanceCopy> = {
  PT: {
    area: 'Conferir com o banco',
    title: 'Conferir com o banco',
    subtitle: 'Prepare a conferência bancária por fonte. O NestFinance só avança quando a conta e o extrato estão identificados e verificáveis.',
    back: 'Voltar',
    retry: 'Tentar novamente',
    loading: 'Verificando contas e extratos…',
    accessDeniedTitle: 'Acesso somente autorizado',
    accessDeniedBody: 'Seu perfil não pode visualizar a conferência com o banco desta igreja.',
    errorTitle: 'Não foi possível conferir com o banco',
    errorBody: 'Tente novamente. Nenhum dado financeiro foi alterado.',
    priorityEyebrow: 'Próximo passo',
    configureAccountTitle: 'Configure uma conta bancária',
    configureAccountText: 'A conciliação precisa saber qual conta da igreja será comparada com o extrato.',
    configureAccountAction: 'Configurar contas',
    needStatementTitle: 'Adicione e identifique um extrato bancário',
    needStatementText: 'Envie o extrato pelo Capturar e identifique o documento como Extrato bancário no Inbox.',
    captureStatementAction: 'Enviar extrato',
    reviewStatementTitle: 'Um extrato precisa ser conferido',
    reviewStatementText: 'O documento já foi identificado como extrato bancário. Confira a fonte antes de usá-la na conciliação.',
    reviewStatementAction: 'Conferir extrato',
    unsupportedTitle: 'O extrato foi conferido, mas a fonte ainda não está pronta',
    unsupportedText: 'Nesta etapa, a preparação automática aceita PDF verificado com leitura determinística. O documento original continua preservado.',
    openStatement: 'Abrir extrato',
    sourceReadyTitle: 'A fonte bancária está pronta',
    sourceReadyText: 'Há conta bancária configurada e extrato PDF conferido. Nenhum saldo ou lançamento foi alterado.',
    summaryAccounts: 'Contas bancárias',
    summaryStatements: 'Extratos identificados',
    summaryPending: 'Para conferir',
    summaryReady: 'Fontes prontas',
    accountsTitle: 'Contas para conciliação',
    accountsText: 'Somente contas bancárias ativas e configuradas podem ser usadas como fonte da conciliação.',
    statementsTitle: 'Extratos bancários',
    statementsText: 'A lista mostra apenas documentos realmente identificados como extrato bancário por uma pessoa.',
    noAccounts: 'Ainda não há contas bancárias configuradas para conciliação.',
    noStatements: 'Ainda não há extratos bancários identificados nesta entidade.',
    eligible: 'Pronta',
    needsSetup: 'Precisa configurar',
    institutionFallback: 'Instituição não informada',
    accountEnding: (last4) => `Final ${last4}`,
    accountType: {
      bank_checking: 'Conta corrente',
      bank_savings: 'Poupança',
      payment_account: 'Conta de pagamento',
      cash: 'Caixa',
      other: 'Outra conta',
    },
    statementPending: 'Aguardando conferência',
    statementReady: 'Fonte pronta',
    statementUnsupported: 'Formato ainda não suportado',
    received: 'Recebido',
    reviewed: 'Conferido',
    notReviewed: 'Ainda não conferido',
    open: 'Abrir',
    trustTitle: 'Conferência com o banco, sem atalhos perigosos',
    trustText: 'Esta etapa só verifica prontidão e fontes. Não usa IA, não cria lançamento, não altera saldo e não marca movimentações como conciliadas.',
  },
  EN: {
    area: 'Check with the bank',
    title: 'Check with the bank',
    subtitle: 'Prepare bank checking from traceable sources. NestFinance only moves forward when the account and statement are identified and verifiable.',
    back: 'Back',
    retry: 'Try again',
    loading: 'Checking accounts and statements…',
    accessDeniedTitle: 'Authorized access only',
    accessDeniedBody: 'Your current role cannot view financial reconciliation for this church.',
    errorTitle: 'Reconciliation readiness could not be checked',
    errorBody: 'Try again. No financial data was changed.',
    priorityEyebrow: 'Next step',
    configureAccountTitle: 'Configure a bank account',
    configureAccountText: 'Reconciliation needs to know which church account will be compared with the statement.',
    configureAccountAction: 'Configure accounts',
    needStatementTitle: 'Add and identify a bank statement',
    needStatementText: 'Upload the statement through Capture and identify the document as Bank statement in Inbox.',
    captureStatementAction: 'Upload statement',
    reviewStatementTitle: 'A bank statement needs review',
    reviewStatementText: 'The document is already identified as a bank statement. Check the source before using it for reconciliation.',
    reviewStatementAction: 'Review statement',
    unsupportedTitle: 'The statement was reviewed, but the source is not ready yet',
    unsupportedText: 'At this stage, automatic preparation accepts a verified PDF with deterministic reading. The original document remains preserved.',
    openStatement: 'Open statement',
    sourceReadyTitle: 'The bank source is ready',
    sourceReadyText: 'A configured bank account and a reviewed PDF statement are available. No balance or transaction was changed.',
    summaryAccounts: 'Bank accounts',
    summaryStatements: 'Identified statements',
    summaryPending: 'Needs review',
    summaryReady: 'Ready sources',
    accountsTitle: 'Accounts for reconciliation',
    accountsText: 'Only active, configured bank accounts can be used as reconciliation sources.',
    statementsTitle: 'Bank statements',
    statementsText: 'This list only includes documents a person actually identified as a bank statement.',
    noAccounts: 'There are no bank accounts configured for reconciliation yet.',
    noStatements: 'There are no identified bank statements for this entity yet.',
    eligible: 'Ready',
    needsSetup: 'Needs setup',
    institutionFallback: 'Institution not provided',
    accountEnding: (last4) => `Ending ${last4}`,
    accountType: {
      bank_checking: 'Checking account',
      bank_savings: 'Savings account',
      payment_account: 'Payment account',
      cash: 'Cash',
      other: 'Other account',
    },
    statementPending: 'Awaiting review',
    statementReady: 'Source ready',
    statementUnsupported: 'Format not supported yet',
    received: 'Received',
    reviewed: 'Reviewed',
    notReviewed: 'Not reviewed yet',
    open: 'Open',
    trustTitle: 'Reconciliation without risky shortcuts',
    trustText: 'This step only verifies readiness and sources. It does not use AI, create postings, change balances, or mark transactions as reconciled.',
  },
  ES: {
    area: 'Conferir con el banco',
    title: 'Conferir con el banco',
    subtitle: 'Prepara la revisión bancaria desde fuentes rastreables. NestFinance solo avanza cuando la cuenta y el extracto están identificados y son verificables.',
    back: 'Volver',
    retry: 'Intentar de nuevo',
    loading: 'Verificando cuentas y extractos…',
    accessDeniedTitle: 'Acceso solo autorizado',
    accessDeniedBody: 'Tu perfil no puede ver la conciliación financiera de esta iglesia.',
    errorTitle: 'No fue posible verificar la conciliación',
    errorBody: 'Inténtalo de nuevo. Ningún dato financiero fue modificado.',
    priorityEyebrow: 'Próximo paso',
    configureAccountTitle: 'Configura una cuenta bancaria',
    configureAccountText: 'La conciliación necesita saber qué cuenta de la iglesia será comparada con el extracto.',
    configureAccountAction: 'Configurar cuentas',
    needStatementTitle: 'Agrega e identifica un extracto bancario',
    needStatementText: 'Sube el extracto por Capturar e identifica el documento como Extracto bancario en Inbox.',
    captureStatementAction: 'Subir extracto',
    reviewStatementTitle: 'Un extracto necesita revisión',
    reviewStatementText: 'El documento ya está identificado como extracto bancario. Revisa la fuente antes de usarla en la conciliación.',
    reviewStatementAction: 'Revisar extracto',
    unsupportedTitle: 'El extracto fue revisado, pero la fuente todavía no está lista',
    unsupportedText: 'En esta etapa, la preparación automática acepta PDF verificado con lectura determinística. El documento original permanece preservado.',
    openStatement: 'Abrir extracto',
    sourceReadyTitle: 'La fuente bancaria está lista',
    sourceReadyText: 'Hay una cuenta bancaria configurada y un extracto PDF revisado. Ningún saldo ni movimiento fue modificado.',
    summaryAccounts: 'Cuentas bancarias',
    summaryStatements: 'Extractos identificados',
    summaryPending: 'Para revisar',
    summaryReady: 'Fuentes listas',
    accountsTitle: 'Cuentas para conciliación',
    accountsText: 'Solo las cuentas bancarias activas y configuradas pueden usarse como fuente de conciliación.',
    statementsTitle: 'Extractos bancarios',
    statementsText: 'La lista muestra solo documentos que una persona identificó realmente como extracto bancario.',
    noAccounts: 'Todavía no hay cuentas bancarias configuradas para conciliación.',
    noStatements: 'Todavía no hay extractos bancarios identificados en esta entidad.',
    eligible: 'Lista',
    needsSetup: 'Necesita configuración',
    institutionFallback: 'Institución no informada',
    accountEnding: (last4) => `Final ${last4}`,
    accountType: {
      bank_checking: 'Cuenta corriente',
      bank_savings: 'Ahorros',
      payment_account: 'Cuenta de pago',
      cash: 'Caja',
      other: 'Otra cuenta',
    },
    statementPending: 'Esperando revisión',
    statementReady: 'Fuente lista',
    statementUnsupported: 'Formato aún no compatible',
    received: 'Recibido',
    reviewed: 'Revisado',
    notReviewed: 'Aún no revisado',
    open: 'Abrir',
    trustTitle: 'Conciliación sin atajos riesgosos',
    trustText: 'Esta etapa solo verifica preparación y fuentes. No usa IA, no crea asientos, no cambia saldos ni marca movimientos como conciliados.',
  },
};

function formatDate(value: string | null, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function statementStatus(
  item: ReconciliationStatementSource,
  copy: BalanceCopy,
) {
  if (item.state === 'ready_for_native_text_check') {
    return {
      label: copy.statementReady,
      className: 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success',
    };
  }
  if (item.state === 'reviewed_non_pdf') {
    return {
      label: copy.statementUnsupported,
      className: 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning',
    };
  }
  return {
    label: copy.statementPending,
    className: 'border-accent-primary/20 bg-accent-primary/10 text-accent-primary',
  };
}

export default function BalancePage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">{copy.accessDeniedTitle}</h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">{copy.accessDeniedBody}</p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <BalanceContent />
    </FinanceContextGuard>
  );
}

function BalanceContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [readiness, setReadiness] = useState<ReconciliationReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const organizationId = accessState.organizationId || '';
  const canCapture = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const eligibleAccounts = useMemo(
    () => readiness?.accounts.filter((account) => account.eligible) || [],
    [readiness],
  );

  const load = async () => {
    if (!organizationId || !activeFinanceEntityId) return;
    setLoading(true);
    setFailed(false);
    try {
      setReadiness(
        await reconciliationService.readiness(organizationId, activeFinanceEntityId),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setReadiness(null);
    setFailed(false);
    if (organizationId && activeFinanceEntityId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const priority = useMemo(() => {
    if (!readiness) return null;

    const firstPending = readiness.statements.find(
      (item) => item.state === 'pending_review',
    );
    const firstReady = readiness.statements.find(
      (item) => item.state === 'ready_for_native_text_check',
    );
    const firstUnsupported = readiness.statements.find(
      (item) => item.state === 'reviewed_non_pdf',
    );

    if (readiness.state === 'no_bank_account') {
      return {
        title: copy.configureAccountTitle,
        text: copy.configureAccountText,
        action: copy.configureAccountAction,
        route: APP_ROUTES.financeSettingsAccounts,
        icon: Settings2,
      };
    }
    if (readiness.state === 'needs_statement_review' && firstPending) {
      return {
        title: copy.reviewStatementTitle,
        text: copy.reviewStatementText,
        action: copy.reviewStatementAction,
        route: APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', firstPending.evidenceId),
        icon: FileSearch,
      };
    }
    if (readiness.state === 'source_ready' && firstReady) {
      return {
        title: copy.sourceReadyTitle,
        text: copy.sourceReadyText,
        action: copy.openStatement,
        route: APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', firstReady.evidenceId),
        icon: CheckCircle2,
      };
    }
    if (readiness.state === 'reviewed_source_not_supported' && firstUnsupported) {
      return {
        title: copy.unsupportedTitle,
        text: copy.unsupportedText,
        action: copy.openStatement,
        route: APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', firstUnsupported.evidenceId),
        icon: AlertCircle,
      };
    }

    return {
      title: copy.needStatementTitle,
      text: copy.needStatementText,
      action: canCapture ? copy.captureStatementAction : copy.openStatement,
      route: canCapture ? APP_ROUTES.universalCapture : APP_ROUTES.inbox,
      icon: Upload,
    };
  }, [canCapture, copy, readiness]);

  if (failed && !readiness) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.area} />
        <div className="flex flex-1 items-center justify-center p-4 md:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-semantic-danger" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.errorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
            <Button className="mt-6" fullWidth onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </Button>
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={copy.back}
              onClick={() => navigate(APP_ROUTES.finance)}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
            </div>
          </header>

          {loading && !readiness ? (
            <Surface variant="glass" radius="xl" className="p-6" aria-live="polite">
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <RefreshCw className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
                {copy.loading}
              </div>
            </Surface>
          ) : readiness && priority ? (
            <>
              <Surface variant="glass" radius="xl" className="overflow-hidden p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                      <priority.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{copy.priorityEyebrow}</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary sm:text-xl">{priority.title}</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{priority.text}</p>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="w-full shrink-0 sm:w-auto"
                    trailingIcon={<ChevronRight className="h-4 w-4" />}
                    onClick={() => navigate(priority.route)}
                  >
                    {priority.action}
                  </Button>
                </div>
              </Surface>

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={copy.title}>
                {[
                  { label: copy.summaryAccounts, value: readiness.summary.eligibleBankAccounts },
                  { label: copy.summaryStatements, value: readiness.summary.classifiedBankStatements },
                  { label: copy.summaryPending, value: readiness.summary.pendingStatementReview },
                  { label: copy.summaryReady, value: readiness.summary.readyPdfStatements },
                ].map((metric) => (
                  <Surface key={metric.label} variant="elevated" radius="lg" className="p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{metric.value}</p>
                  </Surface>
                ))}
              </section>

              <section>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-text-primary">{copy.accountsTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.accountsText}</p>
                </div>

                {readiness.accounts.length === 0 ? (
                  <Surface variant="elevated" radius="lg" className="p-5 text-sm text-text-muted">{copy.noAccounts}</Surface>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {readiness.accounts.map((account: ReconciliationBankAccount) => (
                      <Surface key={account.accountId} variant="elevated" radius="lg" className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
                              <Building2 className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-semibold text-text-primary">{account.name}</h3>
                              <p className="mt-1 text-xs text-text-muted">
                                {account.institutionName || copy.institutionFallback}
                                {account.accountLast4 ? ` · ${copy.accountEnding(account.accountLast4)}` : ''}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {copy.accountType[account.type] || account.type} · {account.currency}
                              </p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                            account.eligible
                              ? 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success'
                              : 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning'
                          }`}>
                            {account.eligible ? copy.eligible : copy.needsSetup}
                          </span>
                        </div>
                      </Surface>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-text-primary">{copy.statementsTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.statementsText}</p>
                </div>

                {readiness.statements.length === 0 ? (
                  <Surface variant="elevated" radius="lg" className="p-5 text-sm text-text-muted">{copy.noStatements}</Surface>
                ) : (
                  <div className="flex flex-col gap-3">
                    {readiness.statements.map((statement: ReconciliationStatementSource) => {
                      const status = statementStatus(statement, copy);
                      return (
                        <Surface key={statement.evidenceId} variant="elevated" radius="lg" className="p-4 sm:p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
                                <FileText className="h-5 w-5" aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="max-w-full truncate text-sm font-semibold text-text-primary">
                                    {statement.originalFilename || statement.evidenceId}
                                  </h3>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                                    {status.label}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-text-muted">
                                  {copy.received}: {formatDate(statement.createdAt, language)} · {statement.verifiedMimeType || '—'}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  {statement.reviewedAt
                                    ? `${copy.reviewed}: ${formatDate(statement.reviewedAt, language)}`
                                    : copy.notReviewed}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              onClick={() => navigate(APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', statement.evidenceId))}
                            >
                              {copy.open}
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>

                          {statement.state === 'ready_for_native_text_check' && activeFinanceEntityId ? (
                            <ReconciliationStatementPreparationPanel
                              organizationId={organizationId}
                              financeEntityId={activeFinanceEntityId}
                              statement={statement}
                              eligibleAccounts={eligibleAccounts}
                              language={language}
                            />
                          ) : null}
                        </Surface>
                      );
                    })}
                  </div>
                )}
              </section>

              <Surface variant="subtle" radius="lg" className="flex gap-3 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{copy.trustTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.trustText}</p>
                </div>
              </Surface>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
