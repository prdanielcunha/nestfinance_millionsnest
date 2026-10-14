import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { EcosystemAccessState } from '../../types/access';
import type { Language } from '../../contexts/LanguageContext';
import { firebaseAuth } from '../../lib/firebase';
import { createConnectSupportAction } from '../../services/connectSupportAction';

const COPY = {
  PT: ['Suporte no WhatsApp oficial', 'Não foi possível abrir o suporte. Tente novamente em instantes.'],
  EN: ['Support on official WhatsApp', 'Support could not be opened. Please try again shortly.'],
  ES: ['Soporte por WhatsApp oficial', 'No se pudo abrir el soporte. Inténtalo de nuevo en unos instantes.'],
};
export function ConnectSupportButton({ accessState, language }: { accessState: EcosystemAccessState; language: Language }) {
  const scope = useRef(accessState); scope.current = accessState;
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const action = useRef<ReturnType<typeof createConnectSupportAction> | null>(null);
  if (!action.current) action.current = createConnectSupportAction({
    session: () => {
      const user = firebaseAuth.currentUser, context = scope.current;
      return user && context.status === 'granted' && context.organizationId
        ? { uid: user.uid, organizationId: context.organizationId, getToken: () => user.getIdToken() } : null;
    },
    fetch: (input, init) => fetch(input, init), popup: () => window.open('about:blank', '_blank'),
    navigate: url => window.location.assign(url),
    state: (pending, error) => { setBusy(pending); if (pending || error) setFailed(error); },
  });
  useEffect(() => {
    setBusy(false); setFailed(false);
    return () => action.current?.cancel();
  }, [accessState.organizationId, accessState.status]);
  const disabled = busy || accessState.status !== 'granted' || !accessState.organizationId;
  const copy = COPY[language];
  return <div>
    <button type="button" disabled={disabled} aria-busy={busy} onClick={() => void action.current?.open(language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR')}
      className="nf-interactive flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-secondary disabled:opacity-60">
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{copy[0]}</span>
    </button>
    {failed && <p role="status" className="px-2 text-xs text-text-secondary">{copy[1]}</p>}
  </div>;
}
