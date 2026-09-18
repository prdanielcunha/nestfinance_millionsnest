import type { Language } from '@/src/contexts/LanguageContext';
import type { UniversalEvidenceDocumentType } from '../../../../shared/finance/universalEvidenceReview.js';

type ReviewCopy = {
  title: string;
  subtitle: string;
  chooseType: string;
  saveType: string;
  changeType: string;
  needsIdentification: string;
  pendingReview: string;
  reviewed: string;
  notClassified: string;
  classifierRequired: string;
  reviewerRequired: string;
  noteLabel: string;
  notePlaceholder: string;
  reviewAction: string;
  saving: string;
  errorTitle: string;
  errorBody: string;
  safety: string;
  reclassifyWarning: string;
  types: Record<UniversalEvidenceDocumentType, string>;
};

export const INBOX_REVIEW_COPY: Record<Language, ReviewCopy> = {
  PT: {
    title: 'O que fazer com este documento',
    subtitle: 'Identifique o tipo do documento. Depois, quem faz a conferência financeira pode marcá-lo como conferido.',
    chooseType: 'Que documento é este?',
    saveType: 'Salvar tipo',
    changeType: 'Atualizar tipo',
    needsIdentification: 'Para identificar',
    pendingReview: 'Para conferir',
    reviewed: 'Conferido',
    notClassified: 'Ainda não identificado',
    classifierRequired: 'Seu acesso é somente para consulta. Peça a alguém com permissão de registro financeiro para identificar este documento.',
    reviewerRequired: 'A identificação pode ser feita agora. A conclusão da conferência exige permissão de revisão financeira.',
    noteLabel: 'Observação da conferência (opcional)',
    notePlaceholder: 'Ex.: conferido com o extrato de 18/09.',
    reviewAction: 'Marcar como conferido',
    saving: 'Salvando…',
    errorTitle: 'Não foi possível salvar',
    errorBody: 'Atualize a evidência e tente novamente. Nenhum lançamento ou saldo foi alterado.',
    safety: 'Identificar e conferir organiza o Inbox. Isso não cria lançamento, não altera saldo e mantém a trilha de auditoria.',
    reclassifyWarning: 'Se o tipo for alterado depois de uma conferência, o documento volta para “Aguardando conferência”.',
    types: {
      receipt: 'Recibo',
      payment_proof: 'Comprovante de pagamento',
      invoice: 'Fatura ou cobrança',
      bank_statement: 'Extrato bancário',
      tax_document: 'Nota fiscal ou documento fiscal',
      other: 'Outro',
    },
  },
  EN: {
    title: 'What to do with this document',
    subtitle: 'Identify the document type. Then someone with finance review permission can mark it as reviewed.',
    chooseType: 'What kind of document is this?',
    saveType: 'Save type',
    changeType: 'Update type',
    needsIdentification: 'Needs identification',
    pendingReview: 'Needs review',
    reviewed: 'Reviewed',
    notClassified: 'Not identified yet',
    classifierRequired: 'Your access is view-only. Ask someone with finance entry permission to identify this document.',
    reviewerRequired: 'The document can be identified now. Completing the review requires finance review permission.',
    noteLabel: 'Review note (optional)',
    notePlaceholder: 'Example: checked against the Sep 18 bank statement.',
    reviewAction: 'Mark as reviewed',
    saving: 'Saving…',
    errorTitle: 'Could not save',
    errorBody: 'Refresh the evidence and try again. No transaction or balance was changed.',
    safety: 'Identifying and reviewing organizes the Inbox. It does not create a transaction, change balances, or remove the audit trail.',
    reclassifyWarning: 'If the type changes after review, the document returns to “Waiting for review”.',
    types: {
      receipt: 'Receipt',
      payment_proof: 'Payment proof',
      invoice: 'Invoice or bill',
      bank_statement: 'Bank statement',
      tax_document: 'Tax document',
      other: 'Other',
    },
  },
  ES: {
    title: 'Qué hacer con este documento',
    subtitle: 'Identifica el tipo de documento. Después, quien tenga permiso de revisión financiera puede marcarlo como revisado.',
    chooseType: '¿Qué documento es este?',
    saveType: 'Guardar tipo',
    changeType: 'Actualizar tipo',
    needsIdentification: 'Para identificar',
    pendingReview: 'Para revisar',
    reviewed: 'Revisado',
    notClassified: 'Aún no identificado',
    classifierRequired: 'Tu acceso es solo de consulta. Pide a alguien con permiso de registro financiero que identifique este documento.',
    reviewerRequired: 'La identificación puede hacerse ahora. Completar la revisión requiere permiso de revisión financiera.',
    noteLabel: 'Observación de la revisión (opcional)',
    notePlaceholder: 'Ej.: revisado con el extracto del 18/09.',
    reviewAction: 'Marcar como revisado',
    saving: 'Guardando…',
    errorTitle: 'No se pudo guardar',
    errorBody: 'Actualiza la evidencia e inténtalo de nuevo. No se modificó ningún asiento ni saldo.',
    safety: 'Identificar y revisar organiza el Inbox. No crea asientos, no cambia saldos y mantiene la trazabilidad.',
    reclassifyWarning: 'Si el tipo cambia después de una revisión, el documento vuelve a “Esperando revisión”.',
    types: {
      receipt: 'Recibo',
      payment_proof: 'Comprobante de pago',
      invoice: 'Factura o cobro',
      bank_statement: 'Extracto bancario',
      tax_document: 'Documento fiscal',
      other: 'Otro',
    },
  },
};
