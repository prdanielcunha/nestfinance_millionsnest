import { useEffect,useRef,useState,type FormEvent } from 'react';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { payablesService,type PayableAccountingOptions,type PayableListRow,type PayablePaymentRow } from '@/src/services/payablesService';
import { payablePaymentCopy } from './payablePaymentCopy';
import { LedgerPreparation } from './LedgerPreparation';

const inputClass='min-h-14 w-full min-w-0 rounded-xl border border-border-strong bg-surface-default px-4 text-base font-normal text-text-primary';
function parseMoney(text:string){
  if(!text.trim())return 0;
  const value=text.trim().replace(/\s/g,'');
  if(!/^\d{1,10}(?:[,.]\d{1,2})?$/.test(value))return null;
  const [whole,decimal='']=value.split(/[,.]/),amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  return Number.isSafeInteger(amount)&&amount<=20_000_000_000?amount:null;
}
type Pending={action:'recognize'|'payment'|'reverse';payload:Record<string,unknown>;expectedVersion:number;cashOut?:number;applied?:number};
export function PayablePaymentPanel(props:{organizationId:string;financeEntityId:string;payable:PayableListRow;onChanged:()=>Promise<void>}){
  const {language}=useLanguage(),t=payablePaymentCopy[language];
  const [open,setOpen]=useState(false),[options,setOptions]=useState<PayableAccountingOptions|null>(null);
  const [history,setHistory]=useState<PayablePaymentRow[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState<'failed'|'conflict'|'success'|'validation'|'distinct'|null>(null);
  const [historyFailed,setHistoryFailed]=useState(false),[confirmedVersion,setConfirmedVersion]=useState<number|null>(null),[reload,setReload]=useState(0);
  const [category,setCategory]=useState(''),[recognitionDate,setRecognitionDate]=useState('');
  const [account,setAccount]=useState(''),[principal,setPrincipal]=useState(''),[fees,setFees]=useState(''),[discount,setDiscount]=useState(''),[paidOn,setPaidOn]=useState(''),[reference,setReference]=useState(''),[proof,setProof]=useState('');
  const [reverseId,setReverseId]=useState<string|null>(null),[reverseDate,setReverseDate]=useState(''),[reason,setReason]=useState(''),[pending,setPending]=useState<Pending|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),lock=useRef(false),keyRef=useRef<{fingerprint:string;key:string}|null>(null),alive=useRef(true);
  const money=(cents:number)=>new Intl.NumberFormat(language==='PT'?'pt-BR':language==='ES'?'es':'en',{style:'currency',currency:'BRL'}).format(cents/100);
  const {organizationId:org,financeEntityId:entity,payable:p}=props;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!open)return;const trigger=document.activeElement as HTMLElement|null;heading.current?.focus();return()=>{if(trigger?.isConnected)trigger.focus();};},[open]);
  useEffect(()=>{
    if(!open)return;
    const abort=new AbortController();
    setLoading(true);setMessage(null);setHistoryFailed(false);
    void Promise.all([payablesService.accountingOptions(org,entity,abort.signal),payablesService.paymentHistory(org,entity,p.id,undefined,abort.signal)])
      .then(([o,h])=>{if(!abort.signal.aborted){setOptions(o);setHistory(h.items);setCursor(h.nextCursor);}})
      .catch(()=>{if(!abort.signal.aborted)setMessage('failed');})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[open,org,entity,p.id,reload]);
  async function reloadHistory(){
    setHistoryFailed(false);
    try{const h=await payablesService.paymentHistory(org,entity,p.id);if(alive.current){setHistory(h.items);setCursor(h.nextCursor);}}
    catch{if(alive.current)setHistoryFailed(true);}
  }
  async function more(){
    if(!cursor||loading)return;setLoading(true);
    try{const h=await payablesService.paymentHistory(org,entity,p.id,cursor);if(alive.current){setHistory(rows=>[...rows,...h.items]);setCursor(h.nextCursor);}}catch{if(alive.current)setHistoryFailed(true);}finally{if(alive.current)setLoading(false);}
  }
  function prepare(e:FormEvent){
    e.preventDefault();setMessage(null);
    if(!p.postingPerformed){
      if(!category||!recognitionDate){setMessage('validation');return;}
      setPending({action:'recognize',expectedVersion:p.version,payload:{classification:{categoryId:category,recognitionDate}}});return;
    }
    const principalCents=parseMoney(principal),feesCents=options?.feesSupported?parseMoney(fees):0,discountCents=options?.discountSupported?parseMoney(discount):0;
    if(principalCents===null||feesCents===null||discountCents===null||principalCents+discountCents<=0||principalCents+discountCents>p.remainingCents||!account||!paidOn||reference.trim().length<3||proof.trim().length<10){setMessage('validation');return;}
    setPending({action:'payment',expectedVersion:p.version,cashOut:principalCents+feesCents,applied:principalCents+discountCents,
      payload:{input:{accountId:account,principalCents,feesCents,discountCents,paidOn,reference:reference.trim(),evidenceJustification:proof.trim()}}});
  }
  async function confirm(){
    if(!pending||lock.current)return;lock.current=true;setSaving(true);setMessage(null);
    const fingerprint=JSON.stringify({payableId:p.id,...pending});
    if(keyRef.current?.fingerprint!==fingerprint)keyRef.current={fingerprint,key:crypto.randomUUID()};
    try{
      const outcome=await payablesService.accountingCommand(org,entity,p.id,pending.expectedVersion,pending.action,pending.payload,keyRef.current.key);
      if(!alive.current)return;
      setConfirmedVersion(outcome.version);setMessage('success');
      setPending(null);setReverseId(null);setPrincipal('');setFees('');setDiscount('');setReference('');setProof('');keyRef.current=null;
      // A failed refresh must never turn a confirmed financial mutation into
      // "payment failed" or invite the person to submit the same payment anew.
      try{await props.onChanged();}catch{if(alive.current)setHistoryFailed(true);}
      if(alive.current)await reloadHistory();
    }catch(error){
      if(alive.current){
        const code=error instanceof Error?error.message:'';
        if(code==='PAYABLE_VERSION_CONFLICT'){setPending(null);setMessage('conflict');await props.onChanged();}
        else if(code==='PAYABLE_DISTINCT_APPROVER_REQUIRED')setMessage('distinct');
        else setMessage('failed');
      }
    }finally{lock.current=false;if(alive.current)setSaving(false);}
  }
  const panelId='payment-panel-'+p.id;
  return <div className="mt-4 border-t border-border-subtle pt-4">
    <button type="button" aria-expanded={open} aria-controls={panelId} disabled={saving} onClick={()=>{setOpen(value=>!value);setPending(null);}}
      className="nf-interactive min-h-12 w-full rounded-xl border border-border-strong bg-surface-secondary px-4 text-base font-semibold text-accent-primary">{open?t.close:t.open}</button>
    {open?<section id={panelId} aria-labelledby={panelId+'-title'} className="mt-4 space-y-5 rounded-2xl border border-border-subtle bg-surface-secondary/40 p-4 sm:p-6">
      <h4 ref={heading} tabIndex={-1} id={panelId+'-title'} className="text-xl font-semibold text-text-primary">{t.title}</h4>
      {message?<p role={message==='success'?'status':'alert'} className="rounded-xl border border-border-strong bg-surface-default p-4 text-base leading-7 text-text-primary">{t[message]}</p>:null}
      {loading?<p role="status" className="text-base text-text-secondary">{t.loading}</p>:null}
      {!loading&&!options?<button type="button" onClick={()=>setReload(n=>n+1)} className="min-h-12 font-semibold text-accent-primary">{t.retry}</button>:null}
      {confirmedVersion!==null&&p.version<confirmedVersion?<button type="button" disabled={saving} onClick={()=>void props.onChanged()} className="nf-interactive min-h-12 font-semibold text-accent-primary">{t.retry}</button>:null}
      {options?.state==='setup_required'?<p className="text-base leading-7 text-text-secondary">{t.setup}</p>:null}
      {options?.state==='opening_required'?<p className="text-base leading-7 text-text-secondary">{t.opening}</p>:null}
      {options?.canConfigure?<LedgerPreparation organizationId={org} financeEntityId={entity} onReady={()=>setReload(n=>n+1)}/>:null}
      {options?.state==='ready'&&!options.canRecord?<p className="text-base leading-7 text-text-secondary">{t.noPermission}</p>:null}
      {options?.state==='ready'&&options.canRecord&&p.remainingCents>0&&(p.postingPerformed||p.status==='open')&&!pending&&(confirmedVersion===null||p.version>=confirmedVersion)?<form onSubmit={prepare} className="grid gap-4">
        <h5 className="text-lg font-semibold text-text-primary">{p.postingPerformed?t.paymentTitle:t.recognizeTitle}</h5>
        <p className="text-base leading-7 text-text-secondary">{p.postingPerformed?t.paymentHelp:t.recognizeHelp}</p>
        {!p.postingPerformed?<>
          <label className="grid gap-2 text-base font-semibold text-text-primary">{t.category}<select required className={inputClass} value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t.choose}</option>{options.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="grid gap-2 text-base font-semibold text-text-primary">{t.recognitionDate}<input required type="date" className={inputClass} value={recognitionDate} onChange={e=>setRecognitionDate(e.target.value)}/></label>
        </>:<>
          <p className="rounded-xl bg-surface-default p-4 text-base text-text-secondary">{t.remaining}: <strong className="nf-financial-number text-text-primary">{money(p.remainingCents)}</strong></p>
          <label className="grid gap-2 text-base font-semibold text-text-primary">{t.account}<select required className={inputClass} value={account} onChange={e=>setAccount(e.target.value)}><option value="">{t.choose}</option>{options.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-base font-semibold text-text-primary">{t.principal}<input required inputMode="decimal" className={inputClass} value={principal} onChange={e=>setPrincipal(e.target.value)}/></label>
            <label className="grid gap-2 text-base font-semibold text-text-primary">{t.paidOn}<input required type="date" className={inputClass} value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></label>
            {options.feesSupported?<label className="grid gap-2 text-base font-semibold text-text-primary">{t.fees}<input inputMode="decimal" className={inputClass} value={fees} onChange={e=>setFees(e.target.value)}/></label>:null}
            {options.discountSupported?<label className="grid gap-2 text-base font-semibold text-text-primary">{t.discount}<input inputMode="decimal" className={inputClass} value={discount} onChange={e=>setDiscount(e.target.value)}/></label>:null}
          </div>
          <label className="grid gap-2 text-base font-semibold text-text-primary">{t.reference}<input required minLength={3} maxLength={180} className={inputClass} value={reference} onChange={e=>setReference(e.target.value)}/></label>
          <label className="grid gap-2 text-base font-semibold text-text-primary">{t.proof}<textarea required minLength={10} maxLength={500} rows={3} className={inputClass+' py-3'} value={proof} onChange={e=>setProof(e.target.value)}/><span className="text-sm font-normal leading-6 text-text-secondary">{t.proofHelp}</span></label>
        </>}
        <button type="submit" disabled={saving} className="nf-interactive min-h-14 rounded-xl bg-accent-primary px-5 text-base font-semibold text-background-base">{p.postingPerformed?t.save:t.recognize}</button>
      </form>:null}
      {pending?<div className="space-y-4 rounded-xl border border-border-strong bg-surface-default p-5" role="group" aria-label={t.confirmTitle}>
        <h5 className="text-lg font-semibold text-text-primary">{t.confirmTitle}</h5>
        {pending.cashOut!==undefined?<dl className="grid grid-cols-2 gap-3 text-base"><dt>{t.cashOut}</dt><dd className="nf-financial-number text-right font-semibold">{money(pending.cashOut)}</dd><dt>{t.applied}</dt><dd className="nf-financial-number text-right font-semibold">{money(pending.applied!)}</dd></dl>:<p className="text-base leading-7 text-text-secondary">{pending.action==='reverse'?t.reverseHelp:t.recognizeHelp}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><button type="button" disabled={saving} onClick={()=>setPending(null)} className="nf-interactive min-h-14 rounded-xl border border-border-strong px-4 font-semibold">{t.back}</button><button type="button" disabled={saving} onClick={()=>void confirm()} className="nf-interactive min-h-14 rounded-xl bg-accent-primary px-4 font-semibold text-background-base">{saving?t.saving:t.confirm}</button></div>
      </div>:null}
      {p.remainingCents===0?<p className="text-base font-semibold text-semantic-success">{t.settled}</p>:null}
      <div className="space-y-3 border-t border-border-subtle pt-5"><h5 className="text-lg font-semibold text-text-primary">{t.history}</h5>
        {historyFailed?<button type="button" onClick={()=>void reloadHistory()} className="nf-interactive min-h-12 font-semibold text-accent-primary">{t.retry}</button>:null}
        {!history.length&&!loading?<p className="text-base text-text-secondary">{t.empty}</p>:null}
        {history.map(row=><article key={row.id} className="space-y-3 rounded-xl border border-border-subtle bg-surface-default p-4">
          <div className="flex flex-wrap justify-between gap-2 text-base"><span>{row.paidOn}</span><strong className="nf-financial-number">{money(row.cashOutCents)}</strong></div><p className="break-words text-base text-text-secondary">{row.reference}</p>
          <p className="text-sm leading-6 text-text-secondary">{t.principal}: {money(row.principalCents)} · {t.fees}: {money(row.feesCents)} · {t.discount}: {money(row.discountCents)}</p>
          {row.reversed?<p className="text-sm font-semibold text-text-secondary">{t.reversed}</p>:options?.canReverse&&!pending?<>
            <button type="button" disabled={saving} onClick={()=>{setReverseId(row.id);setReason('');setReverseDate('');}} className="nf-interactive min-h-12 text-base font-semibold text-accent-primary">{t.reverse}</button>
            {reverseId===row.id?<form onSubmit={e=>{e.preventDefault();setPending({action:'reverse',expectedVersion:p.version,payload:{paymentId:row.id,reversalDate:reverseDate,reason:reason.trim()}});}} className="grid gap-4 border-t border-border-subtle pt-3">
              <p className="text-base leading-7 text-text-secondary">{t.reverseHelp}</p><label className="grid gap-2 text-base font-semibold">{t.reverseDate}<input required type="date" min={row.paidOn} value={reverseDate} onChange={e=>setReverseDate(e.target.value)} className={inputClass}/></label><label className="grid gap-2 text-base font-semibold">{t.reason}<textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} className={inputClass+' py-3'}/></label><button type="submit" className="nf-interactive min-h-14 rounded-xl border border-border-strong px-4 font-semibold text-accent-primary">{t.reviewReverse}</button>
            </form>:null}
          </>:null}
        </article>)}
        {cursor?<button type="button" disabled={loading||saving} onClick={()=>void more()} className="nf-interactive min-h-14 w-full rounded-xl border border-border-strong px-4 text-base font-semibold text-accent-primary">{t.more}</button>:null}
      </div>
    </section>:null}
  </div>;
}
