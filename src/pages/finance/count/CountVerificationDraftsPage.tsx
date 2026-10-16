import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, LockKeyhole, ShieldCheck } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceTreasuryAreaBoundary } from '@/src/app/boundaries/FinanceTreasuryAreaBoundary';
import { Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { getCompatibility } from '../../../../shared/finance/smartLogic.js';
import {
  COUNT_V3_UI_ENABLED,
  countV3Service,
  type CountV3ProposalPreview,
} from '@/src/services/countV3Service';
import type { CountV3DraftSelection } from '../../../../shared/finance/countV3DraftPlan.js';

type Choice = {accountId:string;categoryId:string;fundId:string;cardSettlementMethod:string};
const WORDS={
  PT:{
    title:'Preparar lançamentos da contagem',
    description:'A tesouraria já aceitou esta contagem. Para cada valor, escolha onde o dinheiro foi recebido e como classificá-lo. Nada será contabilizado ainda.',
    back:'Voltar à contagem',
    total:'Total conferido',
    titleLine:'Origem do valor',
    account:'Em qual conta o dinheiro ficou?',
    category:'Qual é a categoria desta entrada?',
    fund:'Fundo (opcional)',
    noAccount:'Escolha uma conta',
    noCategory:'Escolha uma categoria',
    noFund:'Sem fundo', cardKind:'O cartão foi débito ou crédito?',
    cardPrompt:'Escolha o tipo do cartão', debit:'Débito', credit:'Crédito',
    tithe:'Dízimos',
    offering:'Ofertas',
    other:'Outras contribuições',
    cash:'Dinheiro',pix:'PIX',card:'Cartão',bank_transfer:'Transferência bancária',method_other:'Outra forma',
    create:'Criar rascunhos para revisão',
    creating:'Criando rascunhos…',
    loading:'Carregando valores e contas…',
    noPosting:'Os rascunhos irão para conferência financeira. Este passo não altera o saldo, extrato ou livro razão.',
    missing:'Complete a conta e a categoria de cada valor. O aplicativo não escolherá por você.',
    successTitle:'Lançamentos preparados',
    successBody:'Os rascunhos foram enviados à fila de revisão, sem alterar saldos.',
    review:'Abrir fila de revisão',
    error:'Não foi possível carregar ou criar os rascunhos. Verifique e tente novamente.',
    conflict:'A versão da contagem mudou. Recarregue antes de continuar.',
    alreadyCreated:'Esta contagem já tem lançamentos preparados com outra classificação. Abra a fila de revisão para corrigir; nenhum lançamento novo foi criado.',
    noCompatible:'Não há conta compatível com esta forma de recebimento. Solicite à tesouraria que configure uma conta adequada.',
    cardFirst:'Escolha débito ou crédito para mostrar as contas compatíveis.',
    retry:'Tentar novamente',
    access:'Você não tem autorização financeira para preparar lançamentos.',
  },
  EN:{
    title:'Prepare count financial entries',
    description:'The treasury has accepted this count. Choose where each amount was received and how to classify it. Nothing will be posted yet.',
    back:'Back to count',total:'Verified total',titleLine:'Source of amount',
    account:'Which account holds this money?',category:'Which income category?',fund:'Fund (optional)',
    noAccount:'Choose an account',noCategory:'Choose a category',noFund:'No fund',
    cardKind:'Was this card payment debit or credit?',cardPrompt:'Choose the card type',debit:'Debit',credit:'Credit',
    tithe:'Tithes',offering:'Offerings',other:'Other contributions',
    cash:'Cash',pix:'PIX',card:'Card',bank_transfer:'Bank transfer',method_other:'Other method',
    create:'Create drafts for review',creating:'Creating drafts…',loading:'Loading amounts and accounts…',
    noPosting:'Drafts will go to financial review. This step never changes balances, statements or the ledger.',
    missing:'Choose an account and category for every amount. The app will not guess.',
    successTitle:'Entries prepared',successBody:'Drafts are in the review queue with no balance impact.',
    review:'Open review queue',error:'Could not load or create drafts. Check and retry.',
    conflict:'The count changed. Refresh before continuing.',retry:'Retry',
    alreadyCreated:'This count already has financial entries prepared with another mapping. Open the review queue to correct them; no new entry was created.',
    noCompatible:'No compatible account is configured for this receipt method. Ask treasury to configure a suitable account.',
    cardFirst:'Select debit or credit to see compatible accounts.',
    access:'Your role cannot prepare financial entries.',
  },
  ES:{
    title:'Preparar movimientos del conteo',
    description:'La tesorería ya aceptó el conteo. Seleccione dónde se recibió cada importe y cómo clasificarlo. Todavía no se contabiliza.',
    back:'Volver al conteo',total:'Total verificado',titleLine:'Origen del importe',
    account:'¿En qué cuenta quedó el dinero?',category:'¿Qué categoría de ingreso?',fund:'Fondo (opcional)',
    noAccount:'Seleccione una cuenta',noCategory:'Seleccione una categoría',noFund:'Sin fondo',
    cardKind:'¿El pago fue con tarjeta de débito o crédito?',cardPrompt:'Elija el tipo de tarjeta',debit:'Débito',credit:'Crédito',
    tithe:'Diezmos',offering:'Ofrendas',other:'Otras contribuciones',
    cash:'Efectivo',pix:'PIX',card:'Tarjeta',bank_transfer:'Transferencia bancaria',method_other:'Otra forma',
    create:'Crear borradores para revisión',creating:'Creando borradores…',loading:'Cargando importes y cuentas…',
    noPosting:'Los borradores van a revisión. Este paso no cambia saldos, extractos ni el libro contable.',
    missing:'Elija cuenta y categoría para cada importe. La aplicación no adivinará.',
    successTitle:'Movimientos preparados',successBody:'Los borradores están en revisión sin afectar saldos.',
    review:'Abrir cola de revisión',error:'No fue posible cargar o crear borradores. Intente nuevamente.',
    conflict:'El conteo cambió. Actualice antes de continuar.',retry:'Reintentar',
    alreadyCreated:'Este conteo ya tiene movimientos preparados con otra clasificación. Abra la revisión para corregirlos; no se creó ningún movimiento nuevo.',
    noCompatible:'No hay una cuenta compatible para esta forma de cobro. Solicite a tesorería que configure una cuenta adecuada.',
    cardFirst:'Elija débito o crédito para ver las cuentas compatibles.',
    access:'Su función no autoriza preparar movimientos financieros.',
  },
} as const;

function CountVerificationDraftsBody() {
  const {sessionId} = useParams<{sessionId:string}>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const w = WORDS[language];
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const entityId = activeFinanceEntityId || '';
  const canReview = hasEffectiveCapability(accessState, 'finance.review');
  const [preview,setPreview] = useState<CountV3ProposalPreview|null>(null);
  const [choices,setChoices] = useState<Record<string,Choice>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [done,setDone] = useState(false);
  const epoch = useRef(0);
  const attempt = useRef<{fingerprint:string;key:string}|null>(null);

  const load=async()=>{
    if (!COUNT_V3_UI_ENABLED || !organizationId || !entityId || !sessionId || !canReview) return;
    const n=++epoch.current;
    setLoading(true);setError('');
    try{
      const next=await countV3Service.proposalPreview(organizationId,entityId,sessionId);
      if(epoch.current!==n)return;
      setPreview(next.preview);
      setChoices({});
      setDone(next.preview.alreadyCreated);
      attempt.current=null;
    }catch{if(epoch.current===n)setError(w.error);}
    finally{if(epoch.current===n)setLoading(false);}
  };
  useEffect(()=>{
    setPreview(null);setChoices({});setDone(false);attempt.current=null;
    void load();
    return()=>{epoch.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[organizationId,entityId,sessionId,canReview,language]);

  if(!COUNT_V3_UI_ENABLED)return <Navigate to={APP_ROUTES.count} replace/>;
  if(!canReview)return <main className="mx-auto max-w-xl p-6" role="alert">{w.access}</main>;

  const setChoice=(key:string,field:keyof Choice,value:string)=>{
    setChoices(prev=>({...prev,[key]:{
      accountId:'',categoryId:'',fundId:'',cardSettlementMethod:'',...prev[key],
      [field]:value,
      ...(field==='cardSettlementMethod'?{accountId:''}:{})
    }}));
    setError('');
  };
  const incomplete=preview?.lines.some(line=>{
    const choice=choices[line.lineKey];
    return !choice?.accountId || !choice?.categoryId ||
      (line.receiptMethod==='card' && !choice.cardSettlementMethod);
  })??true;

  const create=async()=>{
    if(!preview||!sessionId||busy||incomplete||done)return;
    const selections:CountV3DraftSelection[]=preview.lines.map(line=>({
      purpose:line.purpose,
      receiptMethod:line.receiptMethod as CountV3DraftSelection['receiptMethod'],
      accountId:choices[line.lineKey].accountId,
      categoryId:choices[line.lineKey].categoryId,
      fundId:choices[line.lineKey].fundId || null,
      ...(line.receiptMethod==='card' ? {cardSettlementMethod: choices[line.lineKey].cardSettlementMethod as 'credit_card'|'debit_card'} : {}),
    }));
    const fingerprint=JSON.stringify([organizationId,entityId,sessionId,preview.version,selections]);
    if(attempt.current?.fingerprint!==fingerprint){
      if(typeof crypto?.randomUUID!=='function'){setError(w.error);return;}
      attempt.current={fingerprint,key:'idcountv3draft_'+crypto.randomUUID()};
    }
    setBusy(true);setError('');
    try{
      await countV3Service.createProposedDrafts(organizationId,entityId,{
        countSessionId:sessionId,expectedVersion:preview.version,selections,
      },attempt.current.key);
      attempt.current=null;setDone(true);
    }catch(e){
      const problem=e as {status?:number;code?:string};
      setError(problem?.code==='COUNT_PROPOSAL_ALREADY_CREATED_WITH_DIFFERENT_SELECTIONS'
        ?w.alreadyCreated:problem?.status===409?w.conflict:w.error);
    }finally{setBusy(false);}
  };
  const money=(amount:number)=>new Intl.NumberFormat(
    language==='PT'?'pt-BR':language==='EN'?'en-US':'es-ES',
    {style:'currency',currency:'BRL'},
  ).format(amount/100);
  const backPath=sessionId?APP_ROUTES.countVerificationV3+'/'+sessionId:APP_ROUTES.countVerificationV3;
  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pb-28 pt-6 sm:px-6">
    <Link to={backPath} className="nf-interactive inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden="true"/>{w.back}
    </Link>
    <div>
      <div className="mb-3 flex items-center gap-2 text-accent-primary">
        <ClipboardCheck className="h-6 w-6" aria-hidden="true"/><ShieldCheck className="h-5 w-5" aria-hidden="true"/>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{w.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{w.description}</p>
    </div>
    <Surface variant="elevated" radius="xl" className="flex items-start gap-3 p-4">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
      <p className="text-sm leading-relaxed text-text-muted">{w.noPosting}</p>
    </Surface>
    {error&&<div role="alert" className="rounded-xl bg-semantic-danger/10 p-4 text-sm text-semantic-danger">
      {error} <button type="button" onClick={()=>void load()} className="ml-3 underline">{w.retry}</button>
    </div>}
    {loading?<p aria-live="polite" className="p-6 text-sm text-text-muted">{w.loading}</p>:done ? (
      <Surface variant="elevated" radius="xl" className="p-6">
        <h2 className="text-xl font-semibold text-text-primary">{w.successTitle}</h2>
        <p className="mt-2 text-sm text-text-secondary">{w.successBody}</p>
        <button type="button" onClick={()=>navigate(APP_ROUTES.financeReview)}
          className="nf-interactive mt-5 min-h-14 rounded-xl bg-accent-primary px-5 font-semibold text-white">
          {w.review}
        </button>
      </Surface>
    ):preview?<>
      <Surface variant="elevated" radius="xl" className="p-5">
        <p className="text-sm font-semibold text-text-primary">{preview.serviceLabel} · {preview.serviceDate}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{w.total}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{money(preview.sourceReviewTotalCents)}</p>
      </Surface>
      {preview.lines.map(line=>{
        const chosen=choices[line.lineKey]||{accountId:'',categoryId:'',fundId:'',cardSettlementMethod:''};
        const methodKey=line.receiptMethod==='other'?'method_other':line.receiptMethod as keyof typeof w;
        const receiptInstrument=line.receiptMethod==='card'
          ? chosen.cardSettlementMethod : line.receiptMethod;
        const compatibleAccounts=receiptInstrument
          ? preview.accountOptions.filter(option=>{
            if(!option.type || option.nature==='clearing')return false;
            const compatibility=getCompatibility(option.type,receiptInstrument,'income');
            return compatibility.level==='recommended'||compatibility.level==='allowed_with_context';
          })
          : [];
        return <Surface key={line.lineKey} variant="elevated" radius="xl" className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase text-text-muted">{w.titleLine}</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">{w[line.purpose]} · {w[methodKey]}</h2>
            </div>
            <p className="text-xl font-semibold tabular-nums text-text-primary">{money(line.amountCents)}</p>
          </div>
          {line.receiptMethod==='card' && (
            <label className="block text-sm font-semibold text-text-primary">
              {w.cardKind}
              <select value={chosen.cardSettlementMethod}
                onChange={event=>setChoice(line.lineKey,'cardSettlementMethod',event.target.value)}
                className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary">
                <option value="">{w.cardPrompt}</option>
                <option value="debit_card">{w.debit}</option>
                <option value="credit_card">{w.credit}</option>
              </select>
            </label>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-text-primary">
              {w.account}
              <select value={chosen.accountId} onChange={e=>setChoice(line.lineKey,'accountId',e.target.value)}
                className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary">
                <option value="">{w.noAccount}</option>
                {compatibleAccounts.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              {line.receiptMethod==='card'&&!receiptInstrument&&(
                <span className="mt-2 block text-sm font-normal text-text-secondary">{w.cardFirst}</span>
              )}
              {receiptInstrument&&compatibleAccounts.length===0&&(
                <span className="mt-2 block text-sm font-normal text-semantic-danger">{w.noCompatible}</span>
              )}
            </label>
            <label className="block text-sm font-semibold text-text-primary">
              {w.category}
              <select value={chosen.categoryId} onChange={e=>setChoice(line.lineKey,'categoryId',e.target.value)}
                className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary">
                <option value="">{w.noCategory}</option>
                {preview.categoryOptions.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold text-text-primary">
            {w.fund}
            <select value={chosen.fundId} onChange={e=>setChoice(line.lineKey,'fundId',e.target.value)}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary">
              <option value="">{w.noFund}</option>
              {preview.fundOptions.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
        </Surface>;
      })}
      {incomplete&&<p role="status" className="rounded-xl bg-semantic-warning/10 p-4 text-sm text-semantic-warning">{w.missing}</p>}
      <div className="sticky bottom-0 -mx-4 border-t border-border-subtle bg-surface-base/95 px-4 py-4 backdrop-blur-md sm:mx-0 sm:border-0">
        <button type="button" disabled={incomplete||busy} onClick={()=>void create()}
          className="nf-interactive min-h-14 w-full rounded-xl bg-accent-primary px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy?w.creating:w.create}
        </button>
      </div>
    </>:null}
  </main>;
}

export default function CountVerificationDraftsPage(){
  return <FinanceContextGuard>
    <FinanceTreasuryAreaBoundary><CountVerificationDraftsBody/></FinanceTreasuryAreaBoundary>
  </FinanceContextGuard>;
}
