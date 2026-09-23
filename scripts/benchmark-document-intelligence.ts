import {
  buildDocumentTransactionAnalysis,
  type DocumentTransactionCategoryOption,
  type DocumentTransactionProviderResult,
} from '../shared/finance/documentTransactionIntelligence';

export type DocumentBenchmarkCase = {
  id: string;
  expected: {
    documentType?: string | null;
    transactionKind?: string | null;
    totalAmountCents?: number | null;
    currency?: string | null;
    occurredAt?: string | null;
    settlementState?: string | null;
    paymentMethod?: string | null;
    categoryId?: string | null;
  };
  categories?: DocumentTransactionCategoryOption[];
  baseline25: DocumentTransactionProviderResult;
  candidate35: DocumentTransactionProviderResult;
};

const keys = ['documentType','transactionKind','totalAmountCents','currency','occurredAt','settlementState','paymentMethod','categoryId'] as const;
function scoreCase(item: DocumentBenchmarkCase, provider: DocumentTransactionProviderResult) {
  const analysis = buildDocumentTransactionAnalysis({ provider, categories:item.categories||[], entityTaxId:null });
  let total=0, correct=0;
  for(const key of keys){
    if(!(key in item.expected)) continue;
    total+=1;
    const expected=(item.expected as any)[key] ?? null;
    const actual=(analysis as any)[key]?.value ?? null;
    if(actual===expected) correct+=1;
  }
  return { correct,total,accuracy:total?correct/total:1 };
}
export function compareDocumentModels(cases:DocumentBenchmarkCase[]){
  let baseCorrect=0,baseTotal=0,candidateCorrect=0,candidateTotal=0;
  const scored=cases.map(item=>{
    const baseline=scoreCase(item,item.baseline25);
    const candidate=scoreCase(item,item.candidate35);
    baseCorrect+=baseline.correct;baseTotal+=baseline.total;
    candidateCorrect+=candidate.correct;candidateTotal+=candidate.total;
    return {id:item.id,baseline,candidate};
  });
  const baselineAccuracy=baseTotal?baseCorrect/baseTotal:0;
  const candidateAccuracy=candidateTotal?candidateCorrect/candidateTotal:0;
  const baselineCorrectionRate=1-baselineAccuracy;
  const candidateCorrectionRate=1-candidateAccuracy;
  const correctionReduction=baselineCorrectionRate>0?(baselineCorrectionRate-candidateCorrectionRate)/baselineCorrectionRate:0;
  const accuracyDeltaPoints=(candidateAccuracy-baselineAccuracy)*100;
  return {
    sampleCount:cases.length,baselineAccuracy,candidateAccuracy,accuracyDeltaPoints,
    baselineCorrectionRate,candidateCorrectionRate,correctionReduction,
    recommendation:accuracyDeltaPoints>=10||correctionReduction>=0.30?'candidate_meets_gate':'keep_baseline',
    liveCalls:false,scored,
  };
}
if(process.argv[1]?.includes('benchmark-document-intelligence')){
  const raw=process.env.NESTFINANCE_DOCUMENT_BENCHMARK_JSON;
  if(!raw){
    console.log(JSON.stringify({status:'READY',liveCalls:false,note:'Use anonymized labeled provider outputs; this benchmark never calls production models.'}));
  }else{
    console.log(JSON.stringify(compareDocumentModels(JSON.parse(raw)),null,2));
  }
}
