import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';
import {
  detectUniversalEvidenceMime,
  isSha256,
  isUniversalEvidenceSize,
} from '../../../shared/finance/universalEvidence.js';
import {
  isReconciliationExceptionReason,
  normalizeReconciliationExceptionComment,
  RECONCILIATION_EXCEPTION_SCHEMA_VERSION,
  type ReconciliationExceptionJustificationResponse,
} from '../../../shared/finance/reconciliationExceptionJustification.js';
import { prepareStatementLines } from '../../../shared/finance/reconciliationStatementLines.js';
import {
  isValidIdempotencyKey,
  isValidRequestId,
  isValidTransactionId,
  generateAuditId,
} from '../../../shared/finance/ledger/ids.js';
import {
  buildIdempotencyKeyHash,
  executeWithIdempotency,
  hashPayload,
} from './idempotencyHelper.js';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_INPUT_BYTES,
} from './universalEvidencePdfTextExtractor.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';

const validEvidenceId=(value:unknown):value is string=>typeof value==='string'&&/^evd_[a-f0-9]{32}$/.test(value);
function eligibleAccount(data:Record<string,any>){
  const type=normalizeAccountType(data.type);
  return data.active!==false&&data.configurationStatus==='complete'&&data.nature==='asset'&&
    (type==='bank_checking'||type==='bank_savings'||type==='payment_account');
}
function exceptionId(input:{organizationId:string;financeEntityId:string;evidenceId:string;accountId:string;lineNumber:number}){
  return 'rex_'+createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0,32);
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const {financeEntityId,evidenceId,accountId,lineNumber,candidateTransactionId,reasonCode,idempotencyKey,requestId}=req.body||{};
    const comment=normalizeReconciliationExceptionComment(req.body?.comment);
    if(
      typeof financeEntityId!=='string'||!financeEntityId.trim()||
      !validEvidenceId(evidenceId)||
      typeof accountId!=='string'||!accountId.trim()||accountId.length>160||
      !Number.isInteger(Number(lineNumber))||Number(lineNumber)<1||Number(lineNumber)>2000||
      (candidateTransactionId!==undefined&&candidateTransactionId!==null&&candidateTransactionId!==''&&!isValidTransactionId(candidateTransactionId))||
      !isReconciliationExceptionReason(reasonCode)||
      comment===null||(reasonCode==='other'&&!comment)||
      !isValidIdempotencyKey(idempotencyKey)||!isValidRequestId(requestId)
    ) return res.status(400).json({error:'INVALID_PARAMETERS'});

    const {db,uid,organizationId,context}=await resolveFinanceRequestContext(req,'finance.review');
    const accountRef=context.repository.getAccountsRef().doc(accountId);
    const evidenceRef=db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
      .collection('universalEvidence').doc(evidenceId);
    const [accountSnap,evidenceSnap]=await Promise.all([accountRef.get(),evidenceRef.get()]);
    if(!accountSnap.exists) return res.status(404).json({error:'RECONCILIATION_ACCOUNT_NOT_FOUND'});
    const account=accountSnap.data()||{}; context.repository.assertEntityIsolation(account);
    if(!eligibleAccount(account)) return res.status(409).json({error:'RECONCILIATION_ACCOUNT_NOT_READY'});
    const evidence=evidenceSnap.data()||{};
    if(!evidenceSnap.exists||evidence.organizationId!==organizationId||evidence.financeEntityId!==financeEntityId)
      return res.status(404).json({error:'EVIDENCE_NOT_FOUND'});
    if(
      evidence.processingState!=='accepted'||evidence.duplicate===true||
      evidence.classification?.source!=='human'||evidence.classification?.documentType!=='bank_statement'||
      evidence.review?.status!=='reviewed'||evidence.verifiedMimeType!=='application/pdf'
    ) return res.status(409).json({error:'RECONCILIATION_STATEMENT_NOT_READY'});

    const byteSize=Number(evidence.byteSize);
    const original=evidence.original&&typeof evidence.original==='object'?evidence.original:null;
    const path=typeof original?.path==='string'?original.path:'';
    const verifiedSha256=original?.verifiedSha256;
    if(!isUniversalEvidenceSize(byteSize)||!path||original?.immutable!==true||
      original?.verifiedMimeType!=='application/pdf'||Number(original?.verifiedByteSize)!==byteSize||!isSha256(verifiedSha256))
      return res.status(422).json({error:'EVIDENCE_CORRUPT'});
    if(byteSize>PDF_TEXT_MAX_INPUT_BYTES) return res.status(413).json({error:'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE'});

    const stored=await getUniversalEvidenceStorageAdapter().readPreview(path);
    if(stored.size!==byteSize||stored.sha256!==verifiedSha256||stored.contentType!=='application/pdf'||
      detectUniversalEvidenceMime(stored.bytes.subarray(0,65536))!=='application/pdf')
      return res.status(422).json({error:'EVIDENCE_CORRUPT'});
    const extraction=await extractNativePdfText(stored.bytes);
    if(extraction.state!=='extracted') return res.status(409).json({error:'RECONCILIATION_SOURCE_UNAVAILABLE'});
    const line=prepareStatementLines(extraction.text).lines.find(item=>item.lineNumber===Number(lineNumber));
    if(!line||line.selectedAmountCents===null||!line.selectedDate)
      return res.status(409).json({error:'RECONCILIATION_EXCEPTION_LINE_CHANGED'});

    let candidateSnapshot:any=null;
    if(candidateTransactionId){
      candidateSnapshot=await context.repository.getTransactionsRef().doc(candidateTransactionId).get();
      if(!candidateSnapshot.exists) return res.status(404).json({error:'RECONCILIATION_TRANSACTION_NOT_FOUND'});
      context.repository.assertEntityIsolation(candidateSnapshot.data()||{});
    }

    const id=exceptionId({organizationId,financeEntityId,evidenceId,accountId,lineNumber:Number(lineNumber)});
    const ref=db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
      .collection('reconciliationExceptionJustifications').doc(id);
    const keyHash=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'reconciliation_exception_justify',idempotencyKey);
    const payloadHash=hashPayload({
      evidenceId,accountId,lineNumber:Number(lineNumber),candidateTransactionId:candidateTransactionId||null,
      reasonCode,comment,sourceDate:line.selectedDate,sourceAmountCents:line.selectedAmountCents,
      sourceDirection:line.selectedDirection,sourceDescription:line.descriptionCandidate,
    });

    const result=await executeWithIdempotency<ReconciliationExceptionJustificationResponse>(
      db,context.repository.getIdempotencyRef(),keyHash,payloadHash,async t=>{
        const existing=await t.get(ref);
        const timestamp=FieldValue.serverTimestamp();
        const record=sanitizeFirestoreObject({
          exceptionId:id,organizationId,financeEntityId,evidenceId,accountId,
          evidenceVersion:Number(evidence.version)||null,lineNumber:Number(lineNumber),
          sourceDate:line.selectedDate,sourceAmountCents:line.selectedAmountCents,
          sourceDirection:line.selectedDirection,sourceDescription:line.descriptionCandidate||null,
          candidateTransactionId:candidateTransactionId||null,
          candidateTransactionVersion:candidateSnapshot?Number(candidateSnapshot.data()?.version)||null:null,
          reasonCode,comment:comment||null,justifiedByUid:uid,justifiedAt:timestamp,
          updatedByUid:uid,updatedAt:timestamp,schemaVersion:RECONCILIATION_EXCEPTION_SCHEMA_VERSION,
          financialMutation:false,reconciliationMutation:false,
        });
        t.set(ref,record,{merge:false});

        const auditId=generateAuditId();
        const auditRef=context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(t,db,auditRef,sanitizeFirestoreObject({
          eventId:auditId,organizationId,financeEntityId,actor:uid,
          resource:'reconciliation_exception',resourceId:id,
          action:existing.exists?'reconciliation.exception_justification_updated':'reconciliation.exception_justified',
          requestId,metadata:{
            evidenceId,accountId,lineNumber:Number(lineNumber),reasonCode,
            candidateTransactionId:candidateTransactionId||null,
            amountCents:line.selectedAmountCents,date:line.selectedDate,
            financialMutation:false,reconciliationMutation:false,
          },createdAt:timestamp,
        }));
        stageFinanceFact(t,db,{
          organizationId,eventType:'RECONCILIATION_EXCEPTION_JUSTIFIED',
          entityType:'finance_reconciliation_exception',entityId:id,actorUserId:uid,
          correlationId:requestId,payload:{
            financeEntityId,evidenceId,accountId,lineNumber:Number(lineNumber),reasonCode,
            candidateTransactionId:candidateTransactionId||null,
            amountCents:line.selectedAmountCents,date:line.selectedDate,
            updated:existing.exists,financialMutation:false,reconciliationMutation:false,
          },
          sourceRefs:[
            {kind:'record',ref:ref.path,version:RECONCILIATION_EXCEPTION_SCHEMA_VERSION},
            {kind:'evidence',ref:evidenceRef.path,version:Number(evidence.version)||undefined},
            {kind:'audit',ref:auditRef.path},
          ],
        });
        return {exceptionId:id,evidenceId,lineNumber:Number(lineNumber),reasonCode,auditRecorded:true,factRecorded:true,financialMutation:false,reconciliationMutation:false};
      }
    );
    return res.status(200).json(result);
  }catch(error:any){
    const code=String(error?.code||error?.message||'');
    if(code.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({error:'FINANCE_IDEMPOTENCY_CONFLICT'});
    if(code==='FORBIDDEN_FINANCE_ACCESS'||code==='FINANCE_ENTITY_MISMATCH'||code==='Session not granted') return res.status(403).json({error:'FORBIDDEN'});
    if(error?.status) return res.status(error.status).json({error:error.error||'UNAUTHORIZED'});
    console.error('Reconciliation exception justification error',error);
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
