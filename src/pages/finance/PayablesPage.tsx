import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, ChevronDown, FileClock, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage,type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { payablesService,type PayableListRow } from '@/src/services/payablesService';
import { parsePayableDraft,type PayableDraft } from '../../../shared/finance/payableObligation.js';

const TEXT:Record<Language,{
  area:string;back:string;title:string;intro:string;createTitle:string;createSubtitle:string;
  description:string;descriptionPlaceholder:string;vendor:string;vendorPlaceholder:string;
  value:string;due:string;document:string;documentPlaceholder:string;notes:string;
  create:string;creating:string;success:string;empty:string;viewTitle:string;status:string;
  review:string;noMoney:string;loadMore:string;loading:string;retry:string;
  validation:string;failure:string;featureOff:string;nonPosting:string;
  dueLabel:string;privacy:string;currencyHelp:string;listError:string;
}> = {
  PT:{
    area:'Tesouraria',back:'Voltar ao financeiro',title:'Contas a pagar',
    intro:'Aqui ficam as contas que ainda não foram pagas. Registrar uma cobrança não significa pagar nem lançar uma despesa no banco.',
    createTitle:'Registrar uma conta para pagar',createSubtitle:'Guarde fornecedor, valor e vencimento. A tesouraria confere antes de qualquer pagamento.',
    description:'O que precisa pagar?',descriptionPlaceholder:'Ex.: Conta de energia de outubro',
    vendor:'Para quem?',vendorPlaceholder:'Ex.: Companhia de energia',
    value:'Qual o valor?',due:'Quando vence?',document:'Número da cobrança (opcional)',
    documentPlaceholder:'Ex.: Fatura 123',notes:'Observações (opcional)',
    create:'Guardar como conta a pagar',creating:'Salvando...',success:'Conta salva para conferência. Nenhum pagamento foi realizado.',
    empty:'Ainda não há contas a pagar cadastradas nesta igreja.',viewTitle:'Contas registradas',status:'Aguardando revisão',
    review:'O pagamento será uma etapa separada, após conferência. Esta tela não marca contas como pagas.',
    noMoney:'Não houve saída de dinheiro nem alteração de saldo.',
    loadMore:'Ver mais contas',loading:'Carregando contas...',retry:'Tentar novamente',
    validation:'Preencha uma descrição, fornecedor, valor maior que zero e vencimento válido.',
    failure:'Não foi possível guardar a cobrança. Confira os dados e tente novamente, sem criar outro registro.',
    featureOff:'O cadastro de contas a pagar ainda não está habilitado neste ambiente. Nenhum valor foi registrado.',
    nonPosting:'Aguardando conferência · Não pago',dueLabel:'Vence em',privacy:'Dados financeiros visíveis somente para sua igreja e equipe autorizada.',
    currencyHelp:'Informe em reais, por exemplo 180,50.',listError:'Não foi possível consultar as contas neste momento.',
  },
  EN:{
    area:'Treasury',back:'Back to finance',title:'Bills to pay',
    intro:'These are bills that have not yet been paid. Recording an invoice does not pay it or post a bank expense.',
    createTitle:'Add an unpaid bill',createSubtitle:'Save the supplier, amount and due date. Treasury reviews it before any payment.',
    description:'What needs to be paid?',descriptionPlaceholder:'e.g. October electricity bill',
    vendor:'Payable to whom?',vendorPlaceholder:'e.g. Power company',
    value:'Amount',due:'Due date',document:'Invoice reference (optional)',
    documentPlaceholder:'e.g. Invoice 123',notes:'Notes (optional)',create:'Save unpaid bill',creating:'Saving...',
    success:'Saved for review. No payment was made.',
    empty:'No unpaid bills have been recorded for this church.',viewTitle:'Recorded bills',status:'Awaiting review',
    review:'Payment is a separate step after review. This page cannot mark a bill as paid.',
    noMoney:'No money left the church account and no balance changed.',
    loadMore:'Show more',loading:'Loading bills...',retry:'Try again',
    validation:'Enter a description, supplier, amount greater than zero and valid due date.',
    failure:'Could not save the bill. Review and retry without creating a duplicate.',
    featureOff:'Unpaid bill creation is not yet enabled in this environment. Nothing was saved.',
    nonPosting:'Awaiting review · Unpaid',dueLabel:'Due on',privacy:'Finance records are scoped to your church and authorized team.',
    currencyHelp:'Use a comma for cents, e.g. 180,50.',listError:'Could not read unpaid bills right now.',
  },
  ES:{
    area:'Tesorería',back:'Volver a finanzas',title:'Cuentas por pagar',
    intro:'Aquí se registran facturas todavía no pagadas. Guardar una factura no significa pagarla ni afectar el banco.',
    createTitle:'Registrar una cuenta pendiente',createSubtitle:'Guarda proveedor, importe y vencimiento. Tesorería verifica antes del pago.',
    description:'¿Qué hay que pagar?',descriptionPlaceholder:'Ej.: Electricidad de octubre',
    vendor:'¿A quién?',vendorPlaceholder:'Ej.: Compañía eléctrica',
    value:'Importe',due:'Vencimiento',document:'Referencia de factura (opcional)',
    documentPlaceholder:'Ej.: Factura 123',notes:'Notas (opcional)',create:'Guardar cuenta por pagar',creating:'Guardando...',
    success:'Guardado para revisión. No se hizo ningún pago.',
    empty:'Todavía no hay cuentas por pagar registradas en esta iglesia.',viewTitle:'Cuentas registradas',status:'Pendiente de revisión',
    review:'El pago será un paso independiente después de revisar. Aquí no se marcan facturas como pagadas.',
    noMoney:'No salió dinero ni cambió ningún saldo.',
    loadMore:'Ver más cuentas',loading:'Cargando cuentas...',retry:'Reintentar',
    validation:'Indique concepto, proveedor, importe mayor que cero y vencimiento válido.',
    failure:'No se pudo guardar la factura. Verifique los datos y reintente sin duplicarlos.',
    featureOff:'El registro de cuentas por pagar aún no está habilitado aquí. No se guardó nada.',
    nonPosting:'En revisión · Sin pagar',dueLabel:'Vence el',privacy:'Datos financieros solo de su iglesia y equipo autorizado.',
    currencyHelp:'Use coma para centavos, ej.: 180,50.',listError:'No se pudo consultar las cuentas.',
  },
};
const locale:Record<Language,string>={PT:'pt-BR',EN:'en-US',ES:'es-ES'};
function centsFromText(value:string):number|null {
  // Portuguese/Brazilian display with dot as thousand separator, comma cents.
  // Never use floating point multiplication for money.
  const normalized=value.trim().replace(/\s/g,'').replace(/^R\$/,'');
  if(!/^\d{1,10}(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized)&&
     !/^\d{1,10}(?:,\d{1,2})?$/.test(normalized))return null;
  const [whole,decimal='']=normalized.split(',');
  const numeric=Number(whole.replace(/\./g,''))*100+Number(decimal.padEnd(2,'0'));
  return Number.isSafeInteger(numeric)&&numeric>0&&numeric<=20_000_000_000?numeric:null;
}
function PayablesContent(){
  const navigate=useNavigate();
  const {language}=useLanguage();
  const {accessState}=useAuth();
  const {activeFinanceEntityId}=useFinanceEntity();
  const organizationId=accessState.organizationId||accessState.organization?.id||'';
  const canCreate=hasEffectiveCapability(accessState,'finance.create_drafts');
  const copy=TEXT[language];
  const [description,setDescription]=useState('');
  const [counterparty,setCounterparty]=useState('');
  const [amountText,setAmountText]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [documentReference,setDocumentReference]=useState('');
  const [notes,setNotes]=useState('');
  const [items,setItems]=useState<PayableListRow[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [creationEnabled,setCreationEnabled]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<'success'|'validation'|'failure'|'featureOff'|null>(null);
  const savedFingerprint=useRef<{material:string;key:string}|null>(null);
  const saveLock=useRef(false);
  const activeScopeRef=useRef('');
  activeScopeRef.current=organizationId+'|'+activeFinanceEntityId;

  useEffect(()=>{
    let alive=true;
    const abort=new AbortController();
    setItems([]);setNextCursor(null);setCreationEnabled(null);setListError(false);setLoading(true);setMessage(null);setSaving(false);
    savedFingerprint.current=null;saveLock.current=false;
    if(!activeFinanceEntityId||!organizationId){setLoading(false);return ()=>{alive=false;abort.abort();};}
    void payablesService.list(organizationId,activeFinanceEntityId,undefined,abort.signal)
      .then(page=>{if(alive){setItems(page.items);setNextCursor(page.nextCursor);setCreationEnabled(page.creationEnabled);setListError(false);}})
      .catch(()=>{if(alive&&!abort.signal.aborted)setListError(true);})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;abort.abort();};
  },[activeFinanceEntityId,organizationId]);

  const refresh=async()=>{
    if(!activeFinanceEntityId||!organizationId)return;
    const scope=organizationId+'|'+activeFinanceEntityId;
    setLoading(true);setListError(false);
    try{
      const page=await payablesService.list(organizationId,activeFinanceEntityId);
      if(activeScopeRef.current===scope){setItems(page.items);setNextCursor(page.nextCursor);setCreationEnabled(page.creationEnabled);}
    }catch{if(activeScopeRef.current===scope)setListError(true);}finally{if(activeScopeRef.current===scope)setLoading(false);}
  };
  const loadMore=async()=>{
    if(!activeFinanceEntityId||!organizationId||!nextCursor)return;
    const scope=organizationId+'|'+activeFinanceEntityId;
    setLoading(true);
    try{
      const page=await payablesService.list(organizationId,activeFinanceEntityId,nextCursor);
      if(activeScopeRef.current===scope){setItems(previous=>[...previous,...page.items]);setNextCursor(page.nextCursor);setListError(false);}
    }catch{if(activeScopeRef.current===scope)setListError(true);}finally{if(activeScopeRef.current===scope)setLoading(false);}
  };
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!canCreate||creationEnabled!==true||!activeFinanceEntityId||!organizationId||saveLock.current)return;
    setMessage(null);
    let payload:PayableDraft;
    try{
      const amountCents=centsFromText(amountText);
      if(amountCents===null)throw Error('PAYABLE_INVALID_AMOUNT');
      payload=parsePayableDraft({
        description,counterparty,amountCents,dueDate,
        ...(documentReference.trim()?{documentReference}:{}),
        ...(notes.trim()?{notes}:{}),
      });
    }catch{setMessage('validation');return;}
    const material=JSON.stringify({organizationId,activeFinanceEntityId,payload});
    if(savedFingerprint.current?.material!==material)
      savedFingerprint.current={material,key:crypto.randomUUID()};
    const scope=organizationId+'|'+activeFinanceEntityId;
    saveLock.current=true;setSaving(true);
    try{
      const result=await payablesService.create(organizationId,activeFinanceEntityId,payload,savedFingerprint.current.key);
      if(result.postingPerformed!==false)throw Error('PAYABLE_UNEXPECTED_POSTING');
      if(activeScopeRef.current!==scope)return;
      savedFingerprint.current=null;
      setDescription('');setCounterparty('');setAmountText('');setDueDate('');setNotes('');setDocumentReference('');
      setMessage('success');
      await refresh();
    }catch(error:any){
      if(activeScopeRef.current===scope)setMessage(error?.message==='PAYABLES_CREATION_NOT_ENABLED'?'featureOff':'failure');
    }finally{
      saveLock.current=false;
      if(activeScopeRef.current===scope)setSaving(false);
    }
  };
  const money=(value:number)=>new Intl.NumberFormat(locale[language],{style:'currency',currency:'BRL'}).format(value/100);
  const shortDate=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)?day.split('-').reverse().join('/'):'—';

  return (
    <div className="min-h-full bg-surface-base pb-24 md:pb-10">
      <FinanceEntityContextBar areaName={copy.area}/>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex gap-3">
          <button type="button" aria-label={copy.back} onClick={()=>navigate(APP_ROUTES.treasury)}
            className="nf-interactive flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-default">
            <ArrowLeft aria-hidden="true" className="h-5 w-5"/>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-secondary">{copy.area}</p>
            <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight text-text-primary sm:text-[2rem]">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-text-secondary">{copy.intro}</p>
          </div>
        </header>
        {canCreate && creationEnabled===false && !listError ? (
          <section className="rounded-2xl border border-border-subtle bg-surface-secondary p-5" role="status">
            <p className="text-base leading-relaxed text-text-secondary">{copy.featureOff}</p>
          </section>
        ) : null}
        {canCreate && creationEnabled===true ? <section className="nf-paper-surface rounded-3xl border border-border-subtle bg-surface-default p-5 sm:p-7" aria-labelledby="payable-create-title">
          <div className="mb-5">
            <h2 id="payable-create-title" className="text-xl font-semibold text-text-primary">{copy.createTitle}</h2>
            <p className="mt-2 text-base leading-relaxed text-text-secondary">{copy.createSubtitle}</p>
          </div>
          <form onSubmit={(e)=>void save(e)} className="grid gap-5">
            <label className="grid gap-2 text-base font-semibold text-text-primary">
              {copy.description}
              <input required maxLength={180} minLength={3} value={description} onChange={e=>setDescription(e.target.value)}
                placeholder={copy.descriptionPlaceholder} className="min-h-14 w-full rounded-xl border border-border-strong bg-surface-default px-4 text-base font-normal text-text-primary"/>
            </label>
            <label className="grid gap-2 text-base font-semibold text-text-primary">
              {copy.vendor}
              <input required maxLength={120} minLength={2} value={counterparty} onChange={e=>setCounterparty(e.target.value)}
                placeholder={copy.vendorPlaceholder} className="min-h-14 w-full rounded-xl border border-border-strong bg-surface-default px-4 text-base font-normal text-text-primary"/>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-base font-semibold text-text-primary">
                {copy.value}
                <input required inputMode="decimal" value={amountText} onChange={e=>setAmountText(e.target.value)}
                  placeholder="180,50" aria-describedby="payable-currency-help"
                  className="min-h-14 w-full rounded-xl border border-border-strong bg-surface-default px-4 text-base font-normal text-text-primary"/>
                <span id="payable-currency-help" className="text-sm font-normal text-text-secondary">{copy.currencyHelp}</span>
              </label>
              <label className="grid gap-2 text-base font-semibold text-text-primary">
                {copy.due}
                <input type="date" required value={dueDate} onChange={e=>setDueDate(e.target.value)}
                  className="min-h-14 w-full rounded-xl border border-border-strong bg-surface-default px-4 text-base font-normal text-text-primary"/>
              </label>
            </div>
            <details className="rounded-xl border border-border-subtle bg-surface-secondary/40 p-4">
              <summary className="min-h-10 cursor-pointer text-base font-semibold text-accent-primary">{copy.document} / {copy.notes}</summary>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-text-primary">{copy.document}
                  <input maxLength={100} value={documentReference} onChange={e=>setDocumentReference(e.target.value)}
                    placeholder={copy.documentPlaceholder} className="min-h-12 rounded-xl border border-border-strong bg-surface-default px-4 font-normal"/>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-text-primary">{copy.notes}
                  <textarea rows={3} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
                    className="w-full rounded-xl border border-border-strong bg-surface-default p-4 font-normal"/>
                </label>
              </div>
            </details>
            {message?<p role="status" aria-live="polite" className={`rounded-xl border p-4 text-sm leading-relaxed ${message==='success'?'border-semantic-success/30 text-semantic-success':'border-semantic-warning/30 text-text-primary'}`}>
              {copy[message]}</p>:null}
            <button type="submit" disabled={saving||!activeFinanceEntityId}
              className="nf-interactive min-h-14 w-full rounded-xl bg-accent-primary px-6 py-3 text-base font-semibold text-background-base disabled:opacity-50">
              {saving?copy.creating:copy.create}
            </button>
            <p className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success"/>{copy.noMoney}
            </p>
          </form>
        </section>:null}
        <section className="mt-7" aria-labelledby="payable-list-title">
          <h2 id="payable-list-title" className="text-xl font-semibold text-text-primary">{copy.viewTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.review}</p>
          {listError?<div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-semantic-warning/30 p-4 text-sm">
            <AlertCircle aria-hidden="true" className="h-5 w-5 text-semantic-warning"/>{copy.listError}
            <button type="button" onClick={()=>void refresh()} className="font-semibold text-accent-primary underline">{copy.retry}</button>
          </div>:null}
          {!loading&&!listError&&items.length===0?<p className="mt-4 rounded-2xl border border-border-subtle bg-surface-default p-5 text-base text-text-secondary">{copy.empty}</p>:null}
          <div className="mt-4 space-y-3">
            {items.map(item=><article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-default p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-lg font-semibold text-text-primary">{item.description}</h3>
                  <p className="mt-1 break-words text-sm text-text-secondary">{item.counterparty}</p>
                </div>
                <p className="nf-financial-number text-xl font-semibold tabular-nums text-text-primary">{money(item.remainingCents)}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-4 text-sm text-text-secondary">
                <span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4"/>{copy.dueLabel} {shortDate(item.dueDate)}</span>
                <span className="flex items-center gap-2 font-medium text-semantic-warning"><FileClock aria-hidden="true" className="h-4 w-4"/>{copy.nonPosting}</span>
              </div>
            </article>)}
          </div>
          {loading?<p aria-live="polite" className="mt-4 text-sm text-text-secondary">{copy.loading}</p>:null}
          {nextCursor&&!loading?<button type="button" onClick={()=>void loadMore()}
            className="nf-interactive mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-default px-5 text-base font-semibold text-accent-primary">
            {copy.loadMore}<ChevronDown aria-hidden="true" className="h-5 w-5"/>
          </button>:null}
          <p className="mt-5 text-sm leading-relaxed text-text-muted">{copy.privacy}</p>
        </section>
      </main>
    </div>
  );
}
export default function PayablesPage(){
  return <FinanceContextGuard><PayablesContent/></FinanceContextGuard>;
}
