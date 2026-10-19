import { useAuth } from '@/src/hooks/useAuth';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { Surface } from '@/src/components/foundation';
import { getFinanceEntryProfile } from '@/src/lib/financeEntryProfile';

const COPY = {
  PT: {
    title: 'Seus acessos', allowed: 'Permitido', restricted: 'Não permitido',
    help: 'Cada acesso libera uma tarefa. Registrar entradas e despesas não libera o saldo. Quem administra todo o financeiro também pode ver o saldo.',
    manage: 'Os acessos de cada pessoa são definidos no MillionsNest pela pessoa responsável pela equipe.',
    items: [
      ['finance.balance.view', 'Ver saldo', 'Ver quanto a igreja tem registrado, quando houver dados suficientes para calcular.'],
      ['finance.create_drafts', 'Registrar entradas e despesas', 'Informar valores e comprovantes para conferência.'],
      ['finance.review', 'Conferir lançamentos', 'Conferir informações e pedir correções.'],
      ['finance.approve_for_posting', 'Aprovar lançamentos', 'Autorizar registros já conferidos, conforme as etapas disponíveis.'],
      ['finance.manage', 'Administrar todo o financeiro', 'Acesso amplo ao financeiro, incluindo o saldo e as configurações.'],
    ],
  },
  EN: {
    title: 'Your access', allowed: 'Allowed', restricted: 'Not allowed',
    help: 'Each permission enables a task. Recording income and expenses does not enable balance access. People who manage all finances can also view the balance.',
    manage: 'Each person’s access is set in MillionsNest by the person responsible for the team.',
    items: [
      ['finance.balance.view', 'View balance', 'View the church’s recorded balance when enough verified data is available.'],
      ['finance.create_drafts', 'Record income and expenses', 'Enter amounts and receipts for review.'],
      ['finance.review', 'Check entries', 'Check information and request corrections.'],
      ['finance.approve_for_posting', 'Approve entries', 'Authorize checked records through the available steps.'],
      ['finance.manage', 'Manage all finances', 'Broad financial access, including the balance and settings.'],
    ],
  },
  ES: {
    title: 'Tus accesos', allowed: 'Permitido', restricted: 'No permitido',
    help: 'Cada permiso habilita una tarea. Registrar ingresos y gastos no habilita el saldo. Quien administra todas las finanzas también puede ver el saldo.',
    manage: 'Los accesos de cada persona se definen en MillionsNest por la persona responsable del equipo.',
    items: [
      ['finance.balance.view', 'Ver saldo', 'Ver el saldo registrado de la iglesia cuando haya datos suficientes para calcularlo.'],
      ['finance.create_drafts', 'Registrar ingresos y gastos', 'Informar importes y comprobantes para revisión.'],
      ['finance.review', 'Revisar movimientos', 'Revisar información y solicitar correcciones.'],
      ['finance.approve_for_posting', 'Aprobar movimientos', 'Autorizar registros revisados según las etapas disponibles.'],
      ['finance.manage', 'Administrar todas las finanzas', 'Acceso amplio a las finanzas, incluido el saldo y los ajustes.'],
    ],
  },
} as const;

export function FinanceAccessSummary() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  const entry = getFinanceEntryProfile(accessState);
  const permitted = (capability: string) => hasEffectiveCapability(accessState, capability) &&
    (capability !== 'finance.create_drafts' || entry.canFinance);
  return <section aria-labelledby="finance-access-title">
    <h2 id="finance-access-title" className="mb-3 text-lg font-semibold text-text-primary">{copy.title}</h2>
    <Surface variant="secondary" radius="lg" className="p-4 sm:p-6">
      <p className="max-w-prose text-base leading-relaxed text-text-secondary">{copy.help}</p>
      <ul className="mt-4 divide-y divide-border-subtle">
        {copy.items.map(([capability, title, description]) => <li key={capability} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0 flex-1 basis-48"><p className="text-base font-semibold text-text-primary">{title}</p><p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p></div>
          <span className="rounded-full border border-border-subtle px-3 py-1 text-sm font-medium text-text-secondary">{permitted(capability) ? copy.allowed : copy.restricted}</span>
        </li>)}
      </ul>
      <p className="mt-4 text-sm leading-6 text-text-secondary">{copy.manage}</p>
    </Surface>
  </section>;
}
