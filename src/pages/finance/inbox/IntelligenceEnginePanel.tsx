import { useEffect, useState } from 'react';
import { Button, Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { universalEvidenceInboxService } from '@/src/services/universalEvidenceInboxService';

const COPY = {
  PT: { title:'Motor inteligente', subtitle:'Uso, qualidade e correções — sem lançar nada sozinho.', calls:'Chamadas hoje', cache:'Reuso por cache', latency:'Latência média', corrections:'Memórias ativas', benchmark:'Precisão medida', notMeasured:'Ainda não medida com amostra rotulada', edit:'Salvar ajuste', remove:'Remover', empty:'Nenhuma memória de correção ativa.', loadError:'Não foi possível carregar os indicadores agora.' },
  EN: { title:'Intelligence engine', subtitle:'Usage, quality and corrections — never posts by itself.', calls:'Calls today', cache:'Cache reuse', latency:'Average latency', corrections:'Active memories', benchmark:'Measured accuracy', notMeasured:'Not measured with a labeled sample yet', edit:'Save edit', remove:'Remove', empty:'No active correction memory.', loadError:'Metrics could not be loaded now.' },
  ES: { title:'Motor inteligente', subtitle:'Uso, calidad y correcciones — nunca contabiliza por sí solo.', calls:'Llamadas hoy', cache:'Reuso de caché', latency:'Latencia media', corrections:'Memorias activas', benchmark:'Precisión medida', notMeasured:'Aún no medida con una muestra etiquetada', edit:'Guardar ajuste', remove:'Eliminar', empty:'No hay memorias de corrección activas.', loadError:'No fue posible cargar los indicadores ahora.' },
} as const;

export function IntelligenceEnginePanel() {
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];
  const organizationId = accessState.organizationId || '';
  const [summary,setSummary]=useState<any>(null);
  const [items,setItems]=useState<any[]>([]);
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState('');

  const load=async()=>{
    if(!organizationId||!activeFinanceEntityId) return;
    setError(false);
    try{
      const [nextSummary,nextCorrections]=await Promise.all([
        universalEvidenceInboxService.intelligenceSummary(organizationId,activeFinanceEntityId),
        universalEvidenceInboxService.listCorrections(organizationId,activeFinanceEntityId),
      ]);
      setSummary(nextSummary);
      setItems(nextCorrections.items||[]);
    }catch{ setError(true); }
  };
  useEffect(()=>{ void load(); },[organizationId,activeFinanceEntityId]);

  const save=async(item:any, correctedValue:string)=>{
    if(!organizationId||!activeFinanceEntityId||!correctedValue.trim()) return;
    setBusy(item.id);
    try{
      await universalEvidenceInboxService.saveCorrection(organizationId,activeFinanceEntityId,{
        documentType:item.documentType,fieldKey:item.fieldKey,suggestedValue:item.suggestedValue,correctedValue:correctedValue.trim(),
      });
      await load();
    }finally{ setBusy(''); }
  };
  const remove=async(item:any)=>{
    if(!organizationId||!activeFinanceEntityId) return;
    setBusy(item.id);
    try{ await universalEvidenceInboxService.removeCorrection(organizationId,activeFinanceEntityId,item.id); await load(); }
    finally{ setBusy(''); }
  };

  if(error) return <Surface variant="subtle" radius="xl" className="p-5"><p className="text-sm text-text-muted">{copy.loadError}</p></Surface>;
  if(!summary) return null;
  const cacheTotal=(summary.usage?.providerCalls||0)+(summary.usage?.cacheHits||0);
  const cacheRate=cacheTotal?Math.round((summary.usage.cacheHits/cacheTotal)*100):0;

  return <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
    <p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label={copy.calls} value={String(summary.usage?.providerCalls||0)} />
      <Metric label={copy.cache} value={`${cacheRate}%`} />
      <Metric label={copy.latency} value={`${summary.usage?.averageLatencyMs||0} ms`} />
      <Metric label={copy.corrections} value={String(summary.corrections?.active||0)} />
      <Metric label={copy.benchmark} value={typeof summary.benchmark?.fieldAccuracy==='number'?`${Math.round(summary.benchmark.fieldAccuracy*100)}%`:copy.notMeasured} />
    </div>
    <div className="mt-5 grid gap-3">
      {items.length===0?<p className="text-sm text-text-muted">{copy.empty}</p>:items.map((item)=>{
        const [value,setValue]=[String(item.correctedValue||''),(next:string)=>setItems(current=>current.map(row=>row.id===item.id?{...row,correctedValue:next}:row))];
        return <div key={item.id} className="rounded-xl border border-border-subtle bg-surface-secondary/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{item.documentType} · {item.fieldKey}</p>
          <p className="mt-1 text-sm text-text-secondary">{item.suggestedValue} →</p>
          <input className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-base text-text-primary" value={value} maxLength={100} onChange={e=>setValue(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy===item.id} onClick={()=>void save(item,value)}>{copy.edit}</Button>
            <Button variant="ghost" disabled={busy===item.id} onClick={()=>void remove(item)}>{copy.remove}</Button>
          </div>
        </div>;
      })}
    </div>
  </Surface>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-border-subtle bg-surface-secondary/40 p-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p><p className="mt-2 text-base font-semibold text-text-primary">{value}</p></div>}
