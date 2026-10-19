import { useAuth } from '@/src/hooks/useAuth';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { Surface } from '@/src/components/foundation';
import { getFinanceEntryProfile } from '@/src/lib/financeEntryProfile';
import { returnToMillionsNest } from '@/src/services/ecosystemExitService';

const COPY = {
  PT: {
    title: 'Seus acessos', allowed: 'Permitido', restricted: 'Não permitido',
    help: 'Cada acesso libera uma tarefa. Registrar entradas e despesas não libera o saldo. Quem administra todo o financeiro também pode ver o saldo.',
    manage: 'No MillionsNest, abra a organização, escolha Membros e Convites e depois Permissões do NestFinance na pessoa desejada.',
    open: 'Abrir MillionsNest',
    items: [
      ['finance.count.execute', 'Contar dízimos e ofertas', 'Registrar e conferir o dinheiro recebido no culto.'],
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
    manage: 'In MillionsNest, open the organization, choose Members and Invitations, then NestFinance permissions for the person.',
    open: 'Open MillionsNest',
    items: [
      ['finance.count.execute', 'Count tithes and offerings', 'Record and check money received at the service.'],
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
    manage: 'En MillionsNest, abre la organización, elige Miembros e Invitaciones y luego Permisos de NestFinance en la persona.',
    open: 'Abrir MillionsNest',
    items: [
      ['finance.count.execute', 'Contar diezmos y ofrendas', 'Registrar y revisar el dinero recibido en el culto.'],
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
      <button type="button" onClick={() => returnToMillionsNest()} className="nf-interactive mt-3 min-h-12 rounded-xl border border-border-strong px-4 py-3 text-sm font-semibold text-text-primary">{copy.open}</button>
    </Surface>
  </section>;
}
