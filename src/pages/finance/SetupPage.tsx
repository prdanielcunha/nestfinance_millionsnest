import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Calendar, FileText, Save, Shield, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceSelect } from '@/src/components/finance/FinanceSelect';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { firebaseAuth } from '@/src/lib/firebase';
import { resolveEcosystemSession } from '@/src/services/sessionResolutionService';

type ContributionEntryMode = 'aggregate' | 'anonymous_items' | 'identified_items' | 'mixed';

type SetupCopy = {
  title: string;
  back: string;
  confirm: string;
  saving: string;
  authError: string;
  sessionError: string;
  saveError: string;
  calendarTitle: string;
  timezoneLabel: string;
  timezoneGuidance: string;
  fiscalMonthLabel: string;
  fiscalMonthGuidance: string;
  fiscalDayLabel: string;
  fiscalDayHelp: string;
  contributionsTitle: string;
  entryModeLabel: string;
  entryModeGuidance: string;
  aggregate: string;
  aggregateDescription: string;
  anonymous: string;
  anonymousDescription: string;
  identified: string;
  identifiedDescription: string;
  mixed: string;
  mixedDescription: string;
  trackedProfiles: string;
  trackedProfilesDescription: string;
  countPolicyTitle: string;
  requireTwoCounters: string;
  requireTwoCountersDescription: string;
  distinctCounters: string;
  distinctCountersDescription: string;
  independentCount: string;
  independentCountDescription: string;
  approvalTitle: string;
  closingApproval: string;
  closingApprovalDescription: string;
  assistedEntry: string;
  assistedEntryDescription: string;
  prohibitSelfApproval: string;
  prohibitSelfApprovalDescription: string;
  timezoneDescriptions: Record<string, string>;
};

const COPY: Record<Language, SetupCopy> = {
  PT: {
    title: 'Configurar o financeiro',
    back: 'Voltar para o financeiro',
    confirm: 'Salvar configuração',
    saving: 'Salvando…',
    authError: 'Sua sessão expirou. Entre novamente para continuar.',
    sessionError: 'A configuração foi salva, mas não conseguimos confirmar a sessão atualizada. Tente entrar novamente.',
    saveError: 'Não foi possível salvar a configuração. Seus dados não foram alterados.',
    calendarTitle: '1. Calendário e período',
    timezoneLabel: 'Fuso horário',
    timezoneGuidance: 'Escolha o fuso usado para datas, contagens e fechamento. Isso evita que registros mudem de dia por diferença de horário.',
    fiscalMonthLabel: 'Início do ano fiscal',
    fiscalMonthGuidance: 'Escolha o primeiro mês do período fiscal usado nos relatórios e no fechamento.',
    fiscalDayLabel: 'Dia de início do mês fiscal',
    fiscalDayHelp: 'Use de 1 a 28. Na maioria das organizações, o dia 1 é a opção mais simples.',
    contributionsTitle: '2. Registro de contribuições',
    entryModeLabel: 'Como registrar as contribuições?',
    entryModeGuidance: 'Escolha o nível de detalhe que sua organização realmente precisa. Essa opção define se valores ficam apenas em totais ou podem ser vinculados a pessoas.',
    aggregate: 'Somente totais',
    aggregateDescription: 'Registra o total de cada tipo de entrada, sem criar itens individuais. É o fluxo mais simples.',
    anonymous: 'Valores individuais sem nome',
    anonymousDescription: 'Registra cada valor separadamente, mas não identifica a pessoa que contribuiu.',
    identified: 'Valores vinculados a pessoas',
    identifiedDescription: 'Permite associar contribuições a perfis identificados e manter histórico nominal.',
    mixed: 'Misturar anônimo e identificado',
    mixedDescription: 'Permite usar registros anônimos e identificados na mesma organização.',
    trackedProfiles: 'Permitir perfis identificados',
    trackedProfilesDescription: 'Permite vincular contribuições a pessoas. Fica indisponível quando o modo escolhido é somente totais ou anônimo.',
    countPolicyTitle: '3. Política de contagem',
    requireTwoCounters: 'Exigir duas pessoas na contagem',
    requireTwoCountersDescription: 'A contagem financeira só é concluída depois da participação de duas pessoas.',
    distinctCounters: 'As duas pessoas precisam ser diferentes',
    distinctCountersDescription: 'Impede que a mesma pessoa faça as duas etapas da conferência.',
    independentCount: 'Manter a segunda contagem cega',
    independentCountDescription: 'A segunda pessoa não vê os valores da primeira antes de confirmar a própria contagem.',
    approvalTitle: '4. Aprovação e auditoria',
    closingApproval: 'Exigir aprovação antes do fechamento',
    closingApprovalDescription: 'O fechamento precisa do aval de uma pessoa com permissão adequada antes de avançar.',
    assistedEntry: 'Permitir registro assistido de datas passadas',
    assistedEntryDescription: 'Permite que administradores registrem fatos anteriores com rastreabilidade, sem transformar isso em postagem contábil automática.',
    prohibitSelfApproval: 'Impedir autoaprovação',
    prohibitSelfApprovalDescription: 'Quem preparou o fechamento não pode aprovar o próprio trabalho.',
    timezoneDescriptions: {
      'America/Sao_Paulo': 'Horário de Brasília (UTC−3). Adequado para Paraná, São Paulo e grande parte do Brasil.',
      'America/Manaus': 'Horário do Amazonas (UTC−4).',
      'America/Bahia': 'Horário de Brasília (UTC−3), identificado pela região da Bahia.',
      UTC: 'Tempo Universal Coordenado. Use apenas se sua operação realmente trabalha em UTC.',
    },
  },
  EN: {
    title: 'Set up finance',
    back: 'Back to finance',
    confirm: 'Save setup',
    saving: 'Saving…',
    authError: 'Your session expired. Sign in again to continue.',
    sessionError: 'The setup was saved, but the updated session could not be confirmed. Please sign in again.',
    saveError: 'The setup could not be saved. Your data was not changed.',
    calendarTitle: '1. Calendar and period',
    timezoneLabel: 'Time zone',
    timezoneGuidance: 'Choose the time zone used for dates, counts, and close. This prevents records from moving to another day because of time differences.',
    fiscalMonthLabel: 'Fiscal year starts in',
    fiscalMonthGuidance: 'Choose the first month of the fiscal period used by reports and close.',
    fiscalDayLabel: 'Fiscal month starts on day',
    fiscalDayHelp: 'Use a day from 1 to 28. For most organizations, day 1 is the simplest option.',
    contributionsTitle: '2. Contribution records',
    entryModeLabel: 'How should contributions be recorded?',
    entryModeGuidance: 'Choose only the level of detail your organization needs. This determines whether amounts stay as totals or can be linked to people.',
    aggregate: 'Totals only',
    aggregateDescription: 'Records totals by contribution type without individual items. This is the simplest workflow.',
    anonymous: 'Individual amounts without names',
    anonymousDescription: 'Records each amount separately without identifying the contributor.',
    identified: 'Amounts linked to people',
    identifiedDescription: 'Allows contributions to be linked to identified profiles with a named history.',
    mixed: 'Mix anonymous and identified',
    mixedDescription: 'Allows anonymous and identified records in the same organization.',
    trackedProfiles: 'Allow identified profiles',
    trackedProfilesDescription: 'Allows contributions to be linked to people. Unavailable when totals-only or anonymous mode is selected.',
    countPolicyTitle: '3. Count policy',
    requireTwoCounters: 'Require two people for counting',
    requireTwoCountersDescription: 'The financial count is completed only after two people participate.',
    distinctCounters: 'The two people must be different',
    distinctCountersDescription: 'Prevents the same person from completing both verification stages.',
    independentCount: 'Keep the second count blind',
    independentCountDescription: 'The second person does not see the first count before confirming their own.',
    approvalTitle: '4. Approval and audit',
    closingApproval: 'Require approval before close',
    closingApprovalDescription: 'The close needs approval from someone with the appropriate permission before it can advance.',
    assistedEntry: 'Allow assisted entry for past dates',
    assistedEntryDescription: 'Allows administrators to record past facts with traceability without turning them into automatic accounting posting.',
    prohibitSelfApproval: 'Prevent self-approval',
    prohibitSelfApprovalDescription: 'The person who prepared the close cannot approve their own work.',
    timezoneDescriptions: {
      'America/Sao_Paulo': 'Brasília time (UTC−3). Suitable for Paraná, São Paulo, and much of Brazil.',
      'America/Manaus': 'Amazon time (UTC−4).',
      'America/Bahia': 'Brasília time (UTC−3), identified by the Bahia region.',
      UTC: 'Coordinated Universal Time. Use only if your operation actually works in UTC.',
    },
  },
  ES: {
    title: 'Configurar finanzas',
    back: 'Volver a finanzas',
    confirm: 'Guardar configuración',
    saving: 'Guardando…',
    authError: 'Tu sesión venció. Inicia sesión nuevamente para continuar.',
    sessionError: 'La configuración se guardó, pero no pudimos confirmar la sesión actualizada. Inicia sesión nuevamente.',
    saveError: 'No fue posible guardar la configuración. Tus datos no fueron modificados.',
    calendarTitle: '1. Calendario y período',
    timezoneLabel: 'Zona horaria',
    timezoneGuidance: 'Elige la zona usada para fechas, conteos y cierre. Esto evita que los registros cambien de día por diferencias de horario.',
    fiscalMonthLabel: 'Inicio del año fiscal',
    fiscalMonthGuidance: 'Elige el primer mes del período fiscal usado en informes y cierre.',
    fiscalDayLabel: 'Día de inicio del mes fiscal',
    fiscalDayHelp: 'Usa un día del 1 al 28. Para la mayoría de las organizaciones, el día 1 es la opción más simple.',
    contributionsTitle: '2. Registro de contribuciones',
    entryModeLabel: '¿Cómo registrar las contribuciones?',
    entryModeGuidance: 'Elige solo el nivel de detalle que tu organización necesita. Esto define si los valores quedan como totales o pueden vincularse a personas.',
    aggregate: 'Solo totales',
    aggregateDescription: 'Registra totales por tipo de entrada sin crear elementos individuales. Es el flujo más simple.',
    anonymous: 'Valores individuales sin nombre',
    anonymousDescription: 'Registra cada valor por separado sin identificar a la persona que contribuyó.',
    identified: 'Valores vinculados a personas',
    identifiedDescription: 'Permite asociar contribuciones a perfiles identificados y mantener un historial nominal.',
    mixed: 'Mezclar anónimo e identificado',
    mixedDescription: 'Permite registros anónimos e identificados en la misma organización.',
    trackedProfiles: 'Permitir perfiles identificados',
    trackedProfilesDescription: 'Permite vincular contribuciones a personas. No está disponible en modo solo totales o anónimo.',
    countPolicyTitle: '3. Política de conteo',
    requireTwoCounters: 'Exigir dos personas en el conteo',
    requireTwoCountersDescription: 'El conteo financiero solo se completa después de la participación de dos personas.',
    distinctCounters: 'Las dos personas deben ser diferentes',
    distinctCountersDescription: 'Impide que la misma persona haga las dos etapas de verificación.',
    independentCount: 'Mantener el segundo conteo ciego',
    independentCountDescription: 'La segunda persona no ve los valores de la primera antes de confirmar su propio conteo.',
    approvalTitle: '4. Aprobación y auditoría',
    closingApproval: 'Exigir aprobación antes del cierre',
    closingApprovalDescription: 'El cierre necesita la aprobación de una persona con el permiso adecuado antes de avanzar.',
    assistedEntry: 'Permitir registro asistido de fechas pasadas',
    assistedEntryDescription: 'Permite registrar hechos anteriores con trazabilidad sin convertirlos en contabilización automática.',
    prohibitSelfApproval: 'Impedir autoaprobación',
    prohibitSelfApprovalDescription: 'Quien preparó el cierre no puede aprobar su propio trabajo.',
    timezoneDescriptions: {
      'America/Sao_Paulo': 'Horario de Brasilia (UTC−3). Adecuado para Paraná, São Paulo y gran parte de Brasil.',
      'America/Manaus': 'Horario de Amazonas (UTC−4).',
      'America/Bahia': 'Horario de Brasilia (UTC−3), identificado por la región de Bahía.',
      UTC: 'Tiempo Universal Coordinado. Úsalo solo si tu operación realmente trabaja en UTC.',
    },
  },
};

function localeFor(language: Language) {
  return language === 'PT' ? 'pt-BR' : language === 'EN' ? 'en-US' : 'es-ES';
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [fiscalMonthStartDay, setFiscalMonthStartDay] = useState(1);

  const [contributionEntryMode, setContributionEntryMode] = useState<ContributionEntryMode>('aggregate');
  const [identifiedContributionsEnabled, setIdentifiedContributionsEnabled] = useState(false);

  const [requireTwoCounters, setRequireTwoCounters] = useState(true);
  const [requireDistinctCounters, setRequireDistinctCounters] = useState(true);
  const [requireIndependentCount, setRequireIndependentCount] = useState(true);

  const [requireClosingApproval, setRequireClosingApproval] = useState(true);
  const [allowAssistedEntry, setAllowAssistedEntry] = useState(true);
  const [prohibitSelfApproval, setProhibitSelfApproval] = useState(true);

  const timezoneOptions = useMemo(
    () =>
      ['America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'UTC'].map((value) => ({
        value,
        label: value,
        description: copy.timezoneDescriptions[value],
      })),
    [copy.timezoneDescriptions],
  );

  const fiscalMonthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(localeFor(language), { month: 'long' });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const label = formatter.format(new Date(2026, index, 1));
      return {
        value: String(month),
        label: label.charAt(0).toUpperCase() + label.slice(1),
      };
    });
  }, [language]);

  const contributionOptions = useMemo(
    () => [
      { value: 'aggregate', label: copy.aggregate, description: copy.aggregateDescription },
      { value: 'anonymous_items', label: copy.anonymous, description: copy.anonymousDescription },
      { value: 'identified_items', label: copy.identified, description: copy.identifiedDescription },
      { value: 'mixed', label: copy.mixed, description: copy.mixedDescription },
    ],
    [copy],
  );

  const setEntryMode = (value: string) => {
    const next = value as ContributionEntryMode;
    setContributionEntryMode(next);
    if (next === 'aggregate' || next === 'anonymous_items') {
      setIdentifiedContributionsEnabled(false);
    }
  };

  const isIdentifiedDisabled =
    contributionEntryMode === 'aggregate' || contributionEntryMode === 'anonymous_items';

  const handleSubmit = async () => {
    if (loading || success) return;
    setError(null);
    setLoading(true);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('AUTH_REQUIRED');

      const token = await user.getIdToken(true);
      const response = await fetch('/api/finance/setup/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          timezone,
          fiscalYearStartMonth,
          fiscalMonthStartDay,
          contributionEntryMode,
          identifiedContributionsEnabled,
          requireTwoCounters,
          requireDistinctCounters,
          requireIndependentCount,
          requireClosingApproval,
          allowAssistedEntry,
          prohibitSelfApproval,
        }),
      });

      if (response.status !== 201 && response.status !== 409) {
        throw new Error('SAVE_FAILED');
      }

      const sessionData = await resolveEcosystemSession();
      if (sessionData.status !== 'granted' || sessionData.financeSetup?.status !== 'configured') {
        throw new Error('SESSION_NOT_REFRESHED');
      }

      setSuccess(true);
      window.location.assign(APP_ROUTES.finance);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'SAVE_FAILED';
      setError(
        code === 'AUTH_REQUIRED'
          ? copy.authError
          : code === 'SESSION_NOT_REFRESHED'
            ? copy.sessionError
            : copy.saveError,
      );
      setLoading(false);
    }
  };

  const checkboxClass = (disabled: boolean) =>
    `flex items-start gap-3 rounded-xl border border-border-subtle p-4 transition-colors ${
      disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'
    }`;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 py-8 sm:px-0">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(APP_ROUTES.finance)}
            disabled={loading}
            aria-label={copy.back}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="truncate text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {copy.title}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || success}
          className="flex min-h-[3.25rem] shrink-0 items-center justify-center gap-2 rounded-full bg-text-primary px-5 text-sm font-medium text-surface-base transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-surface-base/40 border-t-surface-base" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{loading ? copy.saving : copy.confirm}</span>
        </button>
      </header>

      {error ? (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
          <p className="text-sm font-medium text-semantic-danger">{error}</p>
        </div>
      ) : null}

      <div className="flex-1 space-y-6 pb-20">
        <section className="space-y-5 rounded-2xl border border-border-subtle bg-surface-secondary p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <Calendar className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-text-primary">{copy.calendarTitle}</h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">{copy.timezoneLabel}</label>
              <FinanceSelect
                value={timezone}
                onChange={setTimezone}
                options={timezoneOptions}
                disabled={loading}
                placeholder={copy.timezoneLabel}
                guidance={copy.timezoneGuidance}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">{copy.fiscalMonthLabel}</label>
              <FinanceSelect
                value={String(fiscalYearStartMonth)}
                onChange={(value) => setFiscalYearStartMonth(Number(value))}
                options={fiscalMonthOptions}
                disabled={loading}
                placeholder={copy.fiscalMonthLabel}
                guidance={copy.fiscalMonthGuidance}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-text-primary">{copy.fiscalDayLabel}</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="28"
                value={fiscalMonthStartDay}
                onChange={(event) => setFiscalMonthStartDay(Number(event.target.value))}
                disabled={loading}
                className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary sm:max-w-xs"
              />
              <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.fiscalDayHelp}</p>
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-border-subtle bg-surface-secondary p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <FileText className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-text-primary">{copy.contributionsTitle}</h2>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">{copy.entryModeLabel}</label>
            <FinanceSelect
              value={contributionEntryMode}
              onChange={setEntryMode}
              options={contributionOptions}
              disabled={loading}
              placeholder={copy.entryModeLabel}
              guidance={copy.entryModeGuidance}
            />
          </div>

          <label className={checkboxClass(loading || isIdentifiedDisabled)}>
            <span className="flex h-6 items-center">
              <input
                type="checkbox"
                checked={identifiedContributionsEnabled}
                onChange={(event) => setIdentifiedContributionsEnabled(event.target.checked)}
                disabled={loading || isIdentifiedDisabled}
                className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
              />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">{copy.trackedProfiles}</span>
              <span className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.trackedProfilesDescription}</span>
            </span>
          </label>
        </section>

        <section className="space-y-5 rounded-2xl border border-border-subtle bg-surface-secondary p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <Users className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-text-primary">{copy.countPolicyTitle}</h2>
          </div>

          <div className="space-y-3">
            <label className={checkboxClass(loading)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireTwoCounters}
                  onChange={(event) => setRequireTwoCounters(event.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.requireTwoCounters}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.requireTwoCountersDescription}</span>
              </span>
            </label>

            <label className={checkboxClass(loading || !requireTwoCounters)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireDistinctCounters}
                  onChange={(event) => setRequireDistinctCounters(event.target.checked)}
                  disabled={loading || !requireTwoCounters}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.distinctCounters}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.distinctCountersDescription}</span>
              </span>
            </label>

            <label className={checkboxClass(loading || !requireTwoCounters)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireIndependentCount}
                  onChange={(event) => setRequireIndependentCount(event.target.checked)}
                  disabled={loading || !requireTwoCounters}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.independentCount}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.independentCountDescription}</span>
              </span>
            </label>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-border-subtle bg-surface-secondary p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <Shield className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-text-primary">{copy.approvalTitle}</h2>
          </div>

          <div className="space-y-3">
            <label className={checkboxClass(loading)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireClosingApproval}
                  onChange={(event) => setRequireClosingApproval(event.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.closingApproval}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.closingApprovalDescription}</span>
              </span>
            </label>

            <label className={checkboxClass(loading)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={allowAssistedEntry}
                  onChange={(event) => setAllowAssistedEntry(event.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.assistedEntry}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.assistedEntryDescription}</span>
              </span>
            </label>

            <label className={checkboxClass(loading)}>
              <span className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={prohibitSelfApproval}
                  onChange={(event) => setProhibitSelfApproval(event.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle bg-surface-base text-accent-primary focus:ring-accent-primary/30"
                />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">{copy.prohibitSelfApproval}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{copy.prohibitSelfApprovalDescription}</span>
              </span>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
