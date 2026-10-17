import { useEffect,useRef,useState,type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft,CalendarDays,ShieldCheck } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { payablesService,PAYABLE_DRAFTS_UI_ENABLED } from '@/src/services/payablesService';

const COPY={
  PT:{
    area:'Contas a pagar',title:'Registrar uma conta para pagar',
    subtitle:'A despesa ainda não foi paga. Guarde os dados agora, confira depois e pague quando chegar a hora.',
    already:'Sim, já paguei',unpaid:'Ainda vou pagar',
    description:'O que precisa pagar?',descriptionHint:'Ex.: Conta de água de outubro',
    amount:'Quanto será pago?',amountHint:'Ex.: 180,50',
    dueDate:'Quando vence?',payee:'Para quem será pago? (opcional)',
    payeeHint:'Ex.: Companhia de água',
    competence:'A que mês pertence? (opcional)',notes:'Observação (opcional)',
    notesHint:'Detalhes úteis para a tesouraria',
    safety:'Salvar esta conta não registra uma despesa paga e não reduz o saldo do caixa ou do banco.',
    save:'Salvar rascunho da conta',saving:'Salvando…',back:'Voltar',
    invalid:'Confira o valor em reais, a descrição e a data de vencimento.',
    unable:'Não foi possível guardar a conta. Nenhum pagamento foi registrado. Tente novamente.',
    disabled:'Cadastro de contas a pagar temporariamente indisponível. Nenhum valor foi lançado.',
    denied:'Seu perfil não pode registrar contas a pagar desta igreja.',
    changed:'Os dados foram alterados. Uma nova tentativa será registrada com a versão atual.',
  },
  EN:{
    area:'Bills to pay',title:'Record a bill to pay',
    subtitle:'This expense has not been paid. Save its details now, review it and pay when it is due.',
    already:'Yes, I already paid',unpaid:'I will pay later',
    description:'What needs to be paid?',descriptionHint:'e.g. October water bill',
    amount:'How much will be paid?',amountHint:'e.g. 180.50',
    dueDate:'When is it due?',payee:'Who will receive payment? (optional)',
    payeeHint:'e.g. Water company',competence:'Accounting date (optional)',notes:'Notes (optional)',
    notesHint:'Helpful information for the finance team',
    safety:'Saving this bill does not record a paid expense or reduce cash or bank balances.',
    save:'Save bill draft',saving:'Saving…',back:'Back',
    invalid:'Check the amount, description and due date.',
    unable:'Could not save the bill. No payment was recorded. Please retry.',
    disabled:'Bill registration is not available yet. No money was posted.',
    denied:'Your role cannot create bills for this church.',
    changed:'Data changed. A new retry will use the current values.',
  },
  ES:{
    area:'Cuentas por pagar',title:'Registrar una cuenta pendiente',
    subtitle:'Este gasto todavía no se pagó. Guarde sus datos ahora, revíselo y pague cuando corresponda.',
    already:'Sí, ya pagué',unpaid:'Pagaré después',
    description:'¿Qué hay que pagar?',descriptionHint:'P. ej., agua de octubre',
    amount:'¿Cuánto se debe pagar?',amountHint:'P. ej., 180,50',
    dueDate:'¿Cuándo vence?',payee:'¿A quién se pagará? (opcional)',
    payeeHint:'P. ej., compañía de agua',
    competence:'Fecha contable (opcional)',notes:'Observaciones (opcional)',
    notesHint:'Detalles útiles para tesorería',
    safety:'Guardar esta cuenta no registra un pago ni reduce saldos de caja o banco.',
    save:'Guardar borrador de la cuenta',saving:'Guardando…',back:'Volver',
    invalid:'Revise importe, descripción y fecha de vencimiento.',
    unable:'No se pudo guardar la cuenta. No se registró ningún pago. Inténtelo de nuevo.',
    disabled:'El registro de cuentas aún no está disponible. No se contabilizó dinero.',
    denied:'Su perfil no puede registrar cuentas pendientes de esta iglesia.',
    changed:'Los datos cambiaron. Un nuevo intento usará los valores actuales.',
  },
} as const;

function exactCentavos(raw:string):number|null{
  const value=raw.trim();
  if(!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value))return null;
  const [integer,fraction='']=value.replace(',','.').split('.');
  const amount=Number(integer)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<=0||amount>20_000_000_000)return null;
  return amount;
}
const inputStyle='nf-interactive h-14 w-full rounded-xl border border-border-default bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20';

export default function PayableCreatePage(){
  const {accessState}=useAuth();
  const navigate=useNavigate();
  const {language}=useLanguage();
  const copy=COPY[language];
  const {activeFinanceEntityId}=useFinanceEntity();
  const org=accessState.organizationId||accessState.organization?.id||'';
  const [description,setDescription]=useState('');
  const [amountRaw,setAmountRaw]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [payeeName,setPayeeName]=useState('');
  const [competenceDate,setCompetenceDate]=useState('');
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const key=useRef<string|null>(null);

  useEffect(()=>{key.current=null;setError(null);},[
    description,amountRaw,dueDate,payeeName,competenceDate,notes,activeFinanceEntityId,
  ]);

  if(!hasEffectiveCapability(accessState,'finance.create_drafts')){
    return <main className="p-6 text-text-primary">{copy.denied}</main>;
  }
  if(!PAYABLE_DRAFTS_UI_ENABLED){
    return <main className="p-6 text-text-primary">{copy.disabled}</main>;
  }
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(saving)return;
    const amountCents=exactCentavos(amountRaw);
    if(!amountCents||description.trim().length<3||!dueDate||!org||!activeFinanceEntityId){
      setError(copy.invalid);return;
    }
    if(!key.current){
      if(typeof crypto.randomUUID!=='function'){setError(copy.unable);return;}
      key.current='idem_payable_'+crypto.randomUUID();
    }
    setSaving(true);setError(null);
    try{
      const result=await payablesService.createDraft(org,activeFinanceEntityId,{
        description:description.trim(),amountCents,dueDate,
        ...(payeeName.trim()?{payeeName:payeeName.trim()}:{}),
        ...(competenceDate?{competenceDate}:{}),
        ...(notes.trim()?{notes:notes.trim()}:{}),
      },key.current);
      navigate(APP_ROUTES.payables,{replace:true,state:{createdPayableId:result.payableId}});
    }catch(error:any){
      setError(error?.code==='PAYABLE_DRAFTS_NOT_ENABLED'?copy.disabled:copy.unable);
    }finally{setSaving(false);}
  };
  return <FinanceContextGuard>
    <div className="flex h-full flex-col bg-surface-base pb-20 font-sans md:pb-0">
      <FinanceEntityContextBar areaName={copy.area}/>
      <div className="mx-auto w-full max-w-2xl px-4 pb-12 sm:px-6">
        <header className="flex items-start gap-3 py-5">
          <button type="button" className="nf-interactive flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            onClick={()=>navigate(APP_ROUTES.payables)} aria-label={copy.back}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true"/>
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
            <p className="mt-2 text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2 pb-5">
          <button type="button" className="nf-interactive min-h-14 rounded-xl border border-border-default px-3 text-sm font-semibold text-text-primary"
            onClick={()=>navigate(APP_ROUTES.transactionCreate+'?direction=expense')}>{copy.already}</button>
          <span aria-current="true" className="flex min-h-14 items-center justify-center rounded-xl border-2 border-accent-primary bg-accent-primary/10 px-3 text-center text-sm font-semibold text-accent-primary">{copy.unpaid}</span>
        </div>
        <Surface variant="secondary" radius="lg" className="p-4 sm:p-6">
          <form className="space-y-5" onSubmit={submit}>
            {error&&<p role="alert" className="rounded-xl border border-semantic-danger/30 bg-semantic-danger/10 p-3 text-sm text-semantic-danger">{error}</p>}
            <div className="space-y-2">
              <label htmlFor="payable-description" className="block text-base font-semibold text-text-primary">{copy.description} *</label>
              <input id="payable-description" required minLength={3} maxLength={240}
                className={inputStyle} disabled={saving} value={description}
                placeholder={copy.descriptionHint} onChange={e=>setDescription(e.target.value)}/>
            </div>
            <div className="space-y-2">
              <label htmlFor="payable-amount" className="block text-base font-semibold text-text-primary">{copy.amount} *</label>
              <input id="payable-amount" type="text" inputMode="decimal" autoComplete="off"
                className={inputStyle} maxLength={14} disabled={saving} value={amountRaw}
                placeholder={copy.amountHint} required onChange={e=>setAmountRaw(e.target.value)}/>
            </div>
            <div className="space-y-2">
              <label htmlFor="payable-due" className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <CalendarDays className="h-5 w-5" aria-hidden="true"/>{copy.dueDate} *
              </label>
              <input id="payable-due" type="date" required min="1900-01-01" max="2100-12-31"
                className={inputStyle} disabled={saving} value={dueDate}
                onChange={e=>setDueDate(e.target.value)}/>
            </div>
            <div className="space-y-2">
              <label htmlFor="payable-payee" className="block text-base font-medium text-text-primary">{copy.payee}</label>
              <input id="payable-payee" className={inputStyle} maxLength={120}
                disabled={saving} value={payeeName} placeholder={copy.payeeHint}
                onChange={e=>setPayeeName(e.target.value)}/>
            </div>
            <details className="rounded-xl border border-border-default p-4">
              <summary className="cursor-pointer text-sm font-semibold text-text-primary">{copy.competence} · {copy.notes}</summary>
              <div className="mt-4 space-y-4">
                <label htmlFor="payable-competence" className="block text-sm font-medium text-text-primary">{copy.competence}</label>
                <input id="payable-competence" type="date" min="1900-01-01" max="2100-12-31"
                  className={inputStyle} disabled={saving} value={competenceDate}
                  onChange={e=>setCompetenceDate(e.target.value)}/>
                <label htmlFor="payable-notes" className="block text-sm font-medium text-text-primary">{copy.notes}</label>
                <textarea id="payable-notes" rows={3} maxLength={500}
                  className="w-full rounded-xl border border-border-default bg-surface-base p-4 text-base text-text-primary"
                  value={notes} onChange={e=>setNotes(e.target.value)} disabled={saving} placeholder={copy.notesHint}/>
              </div>
            </details>
            <div className="flex gap-3 rounded-xl border border-border-default bg-surface-base p-4 text-sm leading-relaxed text-text-secondary">
              <ShieldCheck className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
              <p>{copy.safety}</p>
            </div>
            <button type="submit" disabled={saving||!description.trim()||!dueDate||exactCentavos(amountRaw)===null}
              className="nf-interactive flex min-h-14 w-full items-center justify-center rounded-xl bg-accent-primary px-5 text-base font-semibold text-white disabled:opacity-50">
              {saving?copy.saving:copy.save}
            </button>
          </form>
        </Surface>
      </div>
    </div>
  </FinanceContextGuard>;
}
