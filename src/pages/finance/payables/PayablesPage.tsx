import { useEffect,useRef,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { ArrowLeft,CalendarClock,ChevronRight,Plus,ShieldCheck } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import {
  payablesService,PAYABLE_DRAFTS_UI_ENABLED,type PayableDraftSummary,
  type PayablesPageResult,
} from '@/src/services/payablesService';

const COPY={
  PT:{
    area:'Contas a pagar',title:'O que ainda falta pagar',
    subtitle:'Organize os vencimentos sem misturar contas pendentes com despesas já pagas.',
    new:'Nova conta',empty:'Nenhuma conta pendente cadastrada nesta igreja.',
    emptyBody:'Comece anotando uma conta que ainda será paga.',
    loading:'Carregando contas…',retry:'Tentar novamente',
    error:'Não foi possível consultar as contas desta igreja. Nada foi alterado.',
    status:'Rascunho — aguardando conferência',
    amount:'Valor previsto',due:'Vencimento',today:'Vence hoje',overdue:'Vencida',upcoming:'Vai vencer',
    paid:'Pagamento ainda não registrado',notice:'Estes registros são rascunhos de contas a pagar. Não representam pagamentos confirmados nem reduzem o saldo.',
    more:'Carregar mais contas',remaining:'Há mais contas nesta igreja que ainda não foram carregadas.',
    created:'Conta guardada para conferência, sem registrar pagamento.',back:'Voltar ao financeiro',
    unavailable:'Contas a pagar em preparação. Nenhum valor foi lançado.',
    denied:'Seu perfil não pode consultar as contas a pagar desta igreja.',
    name:'Fornecedor não informado',
  },
  EN:{
    area:'Bills to pay',title:'What still needs payment',
    subtitle:'Track due dates without mixing unpaid bills and expenses already paid.',
    new:'New bill',empty:'No unpaid bill drafts for this church.',
    emptyBody:'Start by recording a bill that will be paid later.',
    loading:'Loading bills…',retry:'Try again',
    error:'Could not load this church’s bills. Nothing was changed.',
    status:'Draft — awaiting review',
    amount:'Expected amount',due:'Due date',today:'Due today',overdue:'Overdue',upcoming:'Upcoming',
    paid:'Payment not recorded',notice:'These are bill drafts. They are not confirmed payments and do not reduce the bank or cash balance.',
    more:'Load more bills',remaining:'There are additional bills for this church.',
    created:'Bill saved for review, without recording payment.',back:'Back to finance',
    unavailable:'Bills to pay are being prepared. No money was posted.',
    denied:'Your role cannot read the bills for this church.',name:'Supplier not specified',
  },
  ES:{
    area:'Cuentas por pagar',title:'Lo que queda por pagar',
    subtitle:'Organice los vencimientos sin confundir cuentas pendientes con gastos pagados.',
    new:'Nueva cuenta',empty:'No hay borradores de cuentas pendientes en esta iglesia.',
    emptyBody:'Comience por anotar una cuenta que todavía no se pagó.',
    loading:'Cargando cuentas…',retry:'Volver a intentar',
    error:'No se pudieron cargar las cuentas de esta iglesia. No se modificó nada.',
    status:'Borrador — pendiente de revisión',
    amount:'Importe previsto',due:'Vencimiento',today:'Vence hoy',overdue:'Vencida',upcoming:'Próxima',
    paid:'Pago aún no registrado',notice:'Estos son borradores. No son pagos confirmados ni reducen saldos de caja o banco.',
    more:'Cargar más cuentas',remaining:'Hay más cuentas de esta iglesia que todavía no se cargaron.',
    created:'Cuenta guardada para revisión, sin registrar pago.',back:'Volver a finanzas',
    unavailable:'Las cuentas pendientes están en preparación. No se contabilizó dinero.',
    denied:'Su perfil no puede consultar cuentas pendientes de esta iglesia.',name:'Proveedor no informado',
  },
} as const;

export default function PayablesPage(){
  const navigate=useNavigate();
  const {state}=useLocation();
  const {language}=useLanguage();
  const {accessState}=useAuth();
  const {activeFinanceEntityId}=useFinanceEntity();
  const org=accessState.organizationId||accessState.organization?.id||'';
  const copy=COPY[language];
  const [items,setItems]=useState<PayableDraftSummary[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);
  const [cursor,setCursor]=useState<PayablesPageResult['nextCursor']>(null);
  const [hasMore,setHasMore]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const epoch=useRef(0);
  const loadingRef=useRef(false);
  const canRead=hasEffectiveCapability(accessState,'finance.view');
  const locale=language==='PT'?'pt-BR':language==='EN'?'en-US':'es-ES';
  const dateNow=new Date();
  const today=[dateNow.getFullYear(),String(dateNow.getMonth()+1).padStart(2,'0'),String(dateNow.getDate()).padStart(2,'0')].join('-');
  const money=(cents:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:'BRL'}).format(cents/100);
  const date=(value:string)=>new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'));
  useEffect(()=>{
    const current=++epoch.current;
    setItems([]);setCursor(null);setHasMore(false);setLoaded(false);setError(false);
    if(!PAYABLE_DRAFTS_UI_ENABLED||!canRead||!org||!activeFinanceEntityId)return;
    loadingRef.current=true;
    setLoading(true);
    void payablesService.list(org,activeFinanceEntityId).then(page=>{
      if(epoch.current!==current)return;
      setItems(page.items);setCursor(page.nextCursor);setHasMore(page.hasMore);setLoaded(true);
    }).catch(()=>{
      if(epoch.current===current)setError(true);
    }).finally(()=>{
      if(epoch.current===current){loadingRef.current=false;setLoading(false);}
    });
    return ()=>{epoch.current++;loadingRef.current=false;};
  },[org,activeFinanceEntityId,canRead]);

  const loadMore=async()=>{
    if(loadingRef.current||!org||!activeFinanceEntityId)return;
    if(loaded&&!hasMore)return;
    const current=epoch.current;
    loadingRef.current=true;setLoading(true);setError(false);
    try{
      const page=await payablesService.list(org,activeFinanceEntityId,cursor||undefined);
      if(epoch.current!==current)return;
      setItems(prev=>{
        const seen=new Set(prev.map(item=>item.id));
        return [...prev,...page.items.filter(item=>!seen.has(item.id))];
      });
      setCursor(page.nextCursor);setHasMore(page.hasMore);setLoaded(true);
    }catch{
      if(epoch.current===current)setError(true);
    }finally{
      if(epoch.current===current){loadingRef.current=false;setLoading(false);}
    }
  };
  if(!canRead)return <main className="p-6 text-text-primary">{copy.denied}</main>;
  if(!PAYABLE_DRAFTS_UI_ENABLED)return <main className="p-6 text-text-primary">{copy.unavailable}</main>;
  return <FinanceContextGuard>
    <div className="flex h-full flex-col bg-surface-base pb-20 font-sans md:pb-0">
      <FinanceEntityContextBar areaName={copy.area}/>
      <div className="mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6">
        <header className="flex items-start gap-3 py-5">
          <button type="button" onClick={()=>navigate(APP_ROUTES.treasury)}
            className="nf-interactive flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            aria-label={copy.back}><ArrowLeft className="h-5 w-5" aria-hidden="true"/></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
            <p className="mt-1 text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
          </div>
        </header>
        <div className="mb-5">
          <button type="button" onClick={()=>navigate(APP_ROUTES.payableCreate)}
            className="nf-interactive flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-5 text-base font-semibold text-white sm:w-auto">
            <Plus className="h-5 w-5" aria-hidden="true"/>{copy.new}
          </button>
        </div>
        {(state as any)?.createdPayableId && <p role="status"
          className="mb-4 rounded-xl border border-border-default bg-surface-elevated p-4 text-sm font-medium text-text-primary">
          {copy.created}
        </p>}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
          <p className="text-sm leading-relaxed text-text-secondary">{copy.notice}</p>
        </div>
        {error&&<div role="alert" className="mb-4 rounded-xl border border-border-default p-4 text-text-primary">
          <p className="text-sm">{copy.error}</p>
          <button type="button" onClick={()=>void loadMore()} className="nf-interactive mt-3 min-h-12 rounded-xl border border-border-default px-4 text-sm font-semibold">{copy.retry}</button>
        </div>}
        {loading&&<p role="status" className="pb-4 text-sm text-text-secondary">{copy.loading}</p>}
        {loaded&&items.length===0&&!error&&!loading&&<Surface variant="secondary" radius="lg" className="p-6 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true"/>
          <p className="mt-3 text-lg font-semibold text-text-primary">{copy.empty}</p>
          <p className="mt-2 text-sm text-text-secondary">{copy.emptyBody}</p>
        </Surface>}
        <ol className="space-y-3">
          {items.map(item=>{
            const timing=item.dueDate===today?copy.today:item.dueDate<today?copy.overdue:copy.upcoming;
            return <li key={item.id}>
              <Surface variant="secondary" radius="lg" className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text-primary">{item.description}</p>
                    <p className="mt-1 text-sm text-text-secondary">{item.payeeName||copy.name}</p>
                    <p className="mt-2 text-xs font-medium text-text-muted">{copy.status}</p>
                  </div>
                  <p className="font-mono text-xl font-semibold tabular-nums text-text-primary">{money(item.amountCents)}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                  <p className="text-sm text-text-secondary">{copy.due}: {date(item.dueDate)} · {timing}</p>
                  <p className="text-xs text-text-muted">{copy.paid}</p>
                </div>
              </Surface>
            </li>;
          })}
        </ol>
        {hasMore&&<div className="mt-5 space-y-2">
          <p className="text-sm text-text-secondary">{copy.remaining}</p>
          <button type="button" disabled={loading} onClick={()=>void loadMore()}
            className="nf-interactive flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-elevated px-4 text-sm font-semibold text-text-primary disabled:opacity-50">
            {copy.more}<ChevronRight className="h-4 w-4" aria-hidden="true"/>
          </button>
        </div>}
      </div>
    </div>
  </FinanceContextGuard>;
}
