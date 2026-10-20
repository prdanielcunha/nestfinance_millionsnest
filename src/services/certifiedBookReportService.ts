import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';
import type { CertifiedReportDelivery } from '../../shared/finance/ledger/certifiedReportDelivery.js';
export async function loadCertifiedReport(organizationId:string,financeEntityId:string,period:string,signal:AbortSignal):Promise<CertifiedReportDelivery>{
  const user=firebaseAuth.currentUser;if(!user||!organizationId||!financeEntityId)throw Error('UNAUTHORIZED');
  const res=await fetch(`${FINANCE_GATEWAY_PATH}?operation=certified-book-report`,{
    method:'POST',cache:'no-store',signal,
    headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json','x-organization-id':organizationId},
    body:JSON.stringify({financeEntityId,period}),
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(typeof data.error==='string'?data.error:'LEDGER_REPORT_UNAVAILABLE');
  return data;
}
