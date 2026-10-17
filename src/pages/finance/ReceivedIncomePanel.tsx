import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { Button, Surface } from '@/src/components/foundation';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
import type { Language } from '@/src/contexts/LanguageContext';
import { RECEIPT_METHODS, type ReceivedIncome } from '../../../shared/finance/receivedIncome';

const COPY = {
  PT: {
    title:'Quanto recebemos?',intro:'Dinheiro, Pix e cartão pela data em que o pagamento foi recebido.',from:'De',to:'Até',search:'Conferir período',loading:'Conferindo os recebimentos…',
    confirmed:'Confirmado no financeiro',pending:'Por conferir ou efetivar',method:'Como recebemos',day:'Por dia de recebimento',
    basis:'A data do recebimento é a informada no lançamento, conferida com o comprovante. Enviar a foto ou digitar em outro dia não muda o período.',
    count:'A contagem aparece uma vez, pelas movimentações preparadas para a tesouraria. Fotos e contagens não são somadas novamente. Transferências entre contas da igreja e depósitos de dinheiro já contado não são novas entradas.',
    hint:'Valores por conferir ficam separados do saldo confirmado. Cartão ainda não recebido deve permanecer fora das entradas recebidas.',
    empty:'Nenhuma entrada registrada neste período.',incomplete:'Há registros inconsistentes, moeda diferente ou contagens repetidas. Esta soma está incompleta; confira as movimentações antes de usar o total.',
    error:'Não foi possível conferir todos os recebimentos. Tente novamente; nenhum valor foi alterado.',
    large:'A quantidade de registros ultrapassa o limite desta consulta. O total não foi exibido para evitar uma soma incompleta.',
    changed:'Clique em Conferir período para consultar as datas escolhidas.',view:'Abrir movimentações',scope:'Fuso da igreja',total:'Total do período',
    methods:{cash:'Dinheiro',pix:'Pix',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',bank_transfer:'Transferência recebida',other:'Outros meios'},
  },
  EN: {
    title:'How much did we receive?',intro:'Cash, Pix and cards by the date payment was received.',from:'From',to:'To',search:'Check period',loading:'Checking receipts…',
    confirmed:'Confirmed in finance',pending:'Awaiting review or posting',method:'Receipt method',day:'By receipt date',
    basis:'The receipt date is the transaction date checked against payment evidence. Uploading or typing on another day does not change the period.',
    count:'A count appears once, through transactions prepared for treasury. Photos and counts are not added again. Transfers between church accounts and deposits of counted cash are not new income.',
    hint:'Pending amounts remain separate from confirmed balances. Card payments not yet received must remain outside received income.',
    empty:'No income recorded for this period.',incomplete:'There are inconsistent records, another currency or repeated counts. This sum is incomplete; review transactions before using the total.',
    error:'Receipts could not be fully checked. Try again; no amount was changed.',large:'There are more records than this query can safely check. No total is shown to avoid an incomplete sum.',
    changed:'Select Check period to query the chosen dates.',view:'Open transactions',scope:'Church timezone',total:'Period total',
    methods:{cash:'Cash',pix:'Pix',credit_card:'Credit card',debit_card:'Debit card',bank_transfer:'Incoming bank transfer',other:'Other methods'},
  },
  ES: {
    title:'¿Cuánto recibimos?',intro:'Efectivo, Pix y tarjeta según la fecha de recepción del pago.',from:'Desde',to:'Hasta',search:'Revisar período',loading:'Revisando los ingresos…',
    confirmed:'Confirmado en finanzas',pending:'Por revisar o contabilizar',method:'Medio de recepción',day:'Por día de recepción',
    basis:'La fecha de recepción es la indicada en el movimiento y revisada con el comprobante. Enviar la foto o digitar otro día no cambia el período.',
    count:'El conteo aparece una vez, mediante los movimientos preparados para tesorería. Fotos y conteos no se suman otra vez. Transferencias entre cuentas de la iglesia y depósitos de efectivo ya contado no son nuevos ingresos.',
    hint:'Los importes pendientes se separan del saldo confirmado. Los pagos con tarjeta aún no recibidos deben quedar fuera de los ingresos recibidos.',
    empty:'No hay ingresos registrados en este período.',incomplete:'Hay registros inconsistentes, otra moneda o conteos repetidos. La suma es incompleta; revise los movimientos antes de usar el total.',
    error:'No fue posible revisar todos los ingresos. Inténtelo de nuevo; ningún importe cambió.',large:'La cantidad de registros supera el límite de esta consulta. No se muestra un total para evitar una suma incompleta.',
    changed:'Seleccione Revisar período para consultar las fechas elegidas.',view:'Abrir movimientos',scope:'Zona horaria de la iglesia',total:'Total del período',
    methods:{cash:'Efectivo',pix:'Pix',credit_card:'Tarjeta de crédito',debit_card:'Tarjeta de débito',bank_transfer:'Transferencia recibida',other:'Otros medios'},
  },
};
function monthRange(period:string){
  const [year,month]=period.split('-').map(Number);
  return {startDate:`${period}-01`,endDate:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
}
type Props={organizationId:string;financeEntityId:string;language:Language;period:string};
export function ReceivedIncomePanel(props:Props){
  return <div key={`${props.organizationId}:${props.financeEntityId}:${props.period}`}><ReceivedIncomeContent {...props}/></div>;
}
function ReceivedIncomeContent({organizationId,financeEntityId,language,period}:Props){
  const copy=COPY[language],id=useId();
  const [range,setRange]=useState(()=>monthRange(period));
  const [submitted,setSubmitted]=useState(()=>monthRange(period));
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<{loading:boolean;data:ReceivedIncome|null;error:string|null}>({loading:true,data:null,error:null});
  const locale=language==='PT'?'pt-BR':language==='ES'?'es-ES':'en-US';
  const money=(cents:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:'BRL'}).format(cents/100);
  const day=(date:string)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',dateStyle:'medium'}).format(new Date(date+'T12:00:00Z'));
  useEffect(()=>{
    const controller=new AbortController();setState({loading:true,data:null,error:null});
    async function load(){
      try{
        const user=getAuth().currentUser;if(!user)throw new Error('UNAUTHORIZED');
        const token=await user.getIdToken();if(controller.signal.aborted)return;
        const response=await fetch(`${FINANCE_GATEWAY_PATH}?operation=received-income-summary`,{
          method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','x-organization-id':organizationId},
          body:JSON.stringify({financeEntityId,...submitted}),
        });
        const data=await response.json();if(!response.ok)throw new Error(data.error||'RECEIPTS_SUMMARY_FAILED');
        if(!controller.signal.aborted)setState({loading:false,data,error:null});
      }catch(error:any){if(!controller.signal.aborted)setState({loading:false,data:null,error:error.message});}
    }
    void load();return()=>controller.abort();
  },[organizationId,financeEntityId,submitted,attempt]);
  const data=state.data,changed=range.startDate!==submitted.startDate||range.endDate!==submitted.endDate;
  const inputClass='mt-1 min-h-14 w-full min-w-0 rounded-lg border border-border-subtle bg-surface-base px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary';
  return <Surface radius="xl" className="p-5 sm:p-6" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-xl font-semibold text-text-primary">{copy.title}</h2>
    <p className="mt-2 text-base text-text-secondary">{copy.intro}</p>
    <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event=>{event.preventDefault();setSubmitted({...range});setAttempt(value=>value+1);}}>
      <label className="min-w-0 text-sm text-text-secondary">{copy.from}<input required type="date" value={range.startDate} max={range.endDate||undefined} onChange={e=>setRange({...range,startDate:e.target.value})} className={inputClass}/></label>
      <label className="min-w-0 text-sm text-text-secondary">{copy.to}<input required type="date" value={range.endDate} min={range.startDate||undefined} onChange={e=>setRange({...range,endDate:e.target.value})} className={inputClass}/></label>
      <Button type="submit" className="min-h-14 self-end" disabled={state.loading}>{copy.search}</Button>
    </form>
    {state.loading&&<p role="status" className="mt-5 text-base text-text-secondary">{copy.loading}</p>}
    {state.error&&<p role="alert" className="mt-5 text-base text-semantic-danger">{state.error==='RECEIPTS_SOURCE_TOO_LARGE'?copy.large:copy.error}</p>}
    {changed&&<p role="status" className="mt-4 text-sm text-text-secondary">{copy.changed}</p>}
    {data&&!changed&&<div className="mt-6">
      {!data.complete&&<p role="alert" className="mb-4 rounded-lg border border-semantic-warning/30 p-3 text-base text-text-primary">{copy.incomplete}</p>}
      <p className="text-sm text-text-muted">{day(data.startDate)} – {day(data.endDate)}</p>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2">
        <div><dt className="text-sm text-text-secondary">{copy.confirmed}</dt><dd className="mt-2 break-words text-3xl font-semibold tabular-nums text-text-primary">{money(data.confirmedCents)}</dd></div>
        <div><dt className="text-sm text-text-secondary">{copy.pending}</dt><dd className="mt-2 break-words text-2xl font-medium tabular-nums text-text-secondary">{money(data.pendingCents)}</dd></div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">{copy.hint}</p>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-sm">
        <caption className="sr-only">{copy.method}</caption>
        <thead><tr className="border-b border-border-subtle text-text-secondary"><th scope="col" className="py-3 pr-3 text-left font-medium">{copy.method}</th><th scope="col" className="px-2 py-3 text-right font-medium">{copy.confirmed}</th><th scope="col" className="py-3 pl-2 text-right font-medium">{copy.pending}</th></tr></thead>
        <tbody>{RECEIPT_METHODS.map(method=><tr key={method} className="border-b border-border-subtle/60"><th scope="row" className="py-4 pr-3 text-left font-normal text-text-primary">{copy.methods[method]}</th><td className="whitespace-nowrap px-2 py-4 text-right tabular-nums text-text-primary">{money(data.confirmedByMethod[method])}</td><td className="whitespace-nowrap py-4 pl-2 text-right tabular-nums text-text-secondary">{money(data.pendingByMethod[method])}</td></tr>)}</tbody>
        <tfoot><tr className="text-text-primary"><th scope="row" className="py-4 text-left">{copy.total}</th><td className="whitespace-nowrap px-2 text-right font-semibold tabular-nums">{money(data.confirmedCents)}</td><td className="whitespace-nowrap pl-2 text-right font-semibold tabular-nums">{money(data.pendingCents)}</td></tr></tfoot>
      </table></div>
      {data.days.length===0?<p className="mt-4 text-base text-text-secondary">{copy.empty}</p>:<details className="mt-4"><summary className="min-h-14 cursor-pointer py-4 text-base font-medium text-accent-primary">{copy.day}</summary><ul className="divide-y divide-border-subtle">{data.days.map(row=><li key={row.date} className="grid gap-2 py-4 sm:grid-cols-3"><span className="font-medium text-text-primary">{day(row.date)}</span><span className="tabular-nums text-text-secondary">{copy.confirmed}: {money(row.confirmedCents)}</span><span className="tabular-nums text-text-secondary">{copy.pending}: {money(row.pendingCents)}</span></li>)}</ul></details>}
      <p className="mt-5 text-sm leading-relaxed text-text-muted">{copy.basis} {copy.scope}: {data.timezone}.</p>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{copy.count}</p>
      <Link to="/finance/transactions" className="mt-4 inline-flex min-h-14 items-center rounded-lg px-2 text-base font-medium text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary">{copy.view}</Link>
    </div>}
  </Surface>;
}
