import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { payablesService } from '@/src/services/payablesService';

export const START_COPY = {
  PT: {title:'Primeiros passos da sua igreja',body:'Vamos explicar o caminho e ajudar você a preparar as contas, os valores iniciais e os repasses. Você pode fazer uma etapa de cada vez.',action:'Começar com orientação'},
  EN: {title:'Your church’s first steps',body:'We will explain the journey and help you prepare accounts, opening amounts and remittances. Take one step at a time.',action:'Start with guidance'},
  ES: {title:'Primeros pasos de tu iglesia',body:'Te explicamos el camino para preparar cuentas, importes iniciales y remesas. Puedes hacer una etapa a la vez.',action:'Empezar con orientación'},
} as const;

/** Only a reminder: canonical setup and permissions always come from the API. */
export function FinanceGettingStarted({organizationId,financeEntityId}:{organizationId:string;financeEntityId:string}) {
  const {language}=useLanguage(),c=START_COPY[language];
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const abort=new AbortController();setVisible(false);
    void payablesService.ledgerStatus(organizationId,financeEntityId,abort.signal)
      .then(s=>{if(!abort.signal.aborted)setVisible(!s.configured||!s.accounts.length||s.accounts.some(a=>!a.certified));})
      .catch(()=>{if(!abort.signal.aborted)setVisible(true);});
    return()=>abort.abort();
  },[organizationId,financeEntityId]);
  if(!visible)return null;
  return <section aria-labelledby="finance-start-title" className="rounded-2xl border border-accent-primary/25 bg-surface-default p-5 sm:p-6">
    <h2 id="finance-start-title" className="text-xl font-semibold text-text-primary">{c.title}</h2>
    <p className="mt-2 max-w-2xl text-base leading-7 text-text-secondary">{c.body}</p>
    <Link to={APP_ROUTES.financeStart} className="nf-interactive mt-4 inline-flex min-h-14 items-center justify-center rounded-xl bg-accent-primary px-5 text-base font-semibold text-background-base">{c.action}</Link>
  </section>;
}
