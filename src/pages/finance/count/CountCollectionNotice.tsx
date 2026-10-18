import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { APP_ROUTES } from '@/src/app/router/routes';

export const COLLECTION_COPY = {
  PT: { title: 'Aqui contamos o dinheiro do culto', body: 'Confira somente notas e moedas. Pix e cartão são registrados pela liderança ou tesouraria em Entradas, mesmo em outro dia. Eles não impedem concluir esta contagem.', action: 'Registrar Pix ou cartão', digitalTitle: 'Entradas recebidas em qualquer dia', digital: 'Registre cada recebimento uma única vez. Use a data em que o valor realmente entrou, mesmo que esteja cadastrando depois. Escolha a categoria Dízimos ou Ofertas quando souber a finalidade. Você não precisa reabrir a contagem do culto.', card: 'No cartão, a data da doação e a do crédito na conta podem ser diferentes. Esta entrada registra o valor já recebido; valores ainda a receber não são saldo disponível. Preserve o comprovante e identifique taxas separadamente para a conferência contábil.' },
  EN: { title: 'Count the service cash here', body: 'Verify only banknotes and coins. Leadership or treasury records Pix and cards in Income, even on another day. They do not prevent this count from being completed.', action: 'Record Pix or card income', digitalTitle: 'Income received on any day', digital: 'Record each receipt only once. Use the day the money actually arrived, even when entering it later. Choose Tithes or Offerings when its purpose is known. You do not need to reopen the service count.', card: 'For cards, the donation date and bank credit date may differ. This entry records money already received; unsettled amounts are not available balances. Retain evidence and identify fees separately for accounting review.' },
  ES: { title: 'Aquí contamos el efectivo del culto', body: 'Verifica solo billetes y monedas. El liderazgo o tesorería registra Pix y tarjetas en Ingresos, incluso otro día. No impiden concluir este conteo.', action: 'Registrar Pix o tarjeta', digitalTitle: 'Ingresos recibidos cualquier día', digital: 'Registra cada ingreso una sola vez. Usa el día en que el dinero realmente ingresó, aunque lo registres después. Selecciona Diezmos u Ofrendas cuando conozcas su finalidad. No necesitas reabrir el conteo del culto.', card: 'En tarjetas, la fecha de donación y del abono bancario pueden diferir. Esta entrada registra dinero ya recibido; lo pendiente no es saldo disponible. Conserva el comprobante e identifica las comisiones por separado para la revisión contable.' },
} as const;
export function CountCollectionNotice({ cashOnly }: { cashOnly: boolean }) {
  const { language } = useLanguage(); const { accessState } = useAuth(); const navigate = useNavigate();
  const copy = COLLECTION_COPY[language];
  if (!cashOnly) return null;
  return <section className="nf-collection-note rounded-2xl border border-border-subtle bg-surface-default p-4 sm:p-5">
    <h2 className="text-base font-semibold text-text-primary">{copy.title}</h2>
    <p className="mt-2 max-w-3xl text-base leading-relaxed text-text-secondary">{copy.body}</p>
    {hasEffectiveCapability(accessState, 'finance.create_drafts') &&
      hasEffectiveCapability(accessState, 'finance.review') ?
      <button type="button" className="mt-3 min-h-12 rounded-xl px-3 text-left text-base font-semibold text-accent-primary hover:bg-surface-secondary focus-visible:outline-accent-primary"
        onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)}>{copy.action}</button> : null}
  </section>;
}
