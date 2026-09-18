import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { UniversalEvidenceDocumentType } from '../../shared/finance/universalEvidenceReview.js';

export interface UniversalEvidenceInboxItem {
  evidenceId: string;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  sourceKind: string | null;
  processingState: string;
  duplicate: boolean;
  imageMetadata: {
    width: number;
    height: number;
    orientation: number;
  } | null;
  createdAt: string | null;
  validatedAt: string | null;
  version: number;
  classification: {
    documentType: UniversalEvidenceDocumentType;
    source: 'human';
    confirmedAt: string | null;
  } | null;
  review: {
    status: 'pending' | 'reviewed';
    reviewedAt: string | null;
    note: string | null;
  } | null;
}

export interface UniversalEvidenceInboxSummary {
  total: number;
  accepted: number;
  duplicate: number;
  awaitingUpload: number;
  needsReview: number;
  reviewed: number;
}

export interface UniversalEvidenceInboxResponse {
  items: UniversalEvidenceInboxItem[];
  nextCursor?: string;
  hasMore: boolean;
  summary: UniversalEvidenceInboxSummary;
  requestId?: string;
}

export interface UniversalEvidenceDetail extends UniversalEvidenceInboxItem {
  declaredMimeType: string | null;
  verifiedMimeType: string | null;
  verification: {
    immutableOriginal: boolean;
    mimeVerified: boolean;
    sizeVerified: boolean;
    contentHashVerified: boolean;
  };
}

export interface UniversalEvidenceDetailResponse {
  evidence: UniversalEvidenceDetail;
  requestId?: string;
}

export interface UniversalEvidencePreviewResponse {
  blob: Blob;
  mimeType: string;
  requestId?: string;
}

export type UniversalEvidencePdfTextLayerState = 'detected' | 'not_detected' | 'unknown';

export interface UniversalEvidencePdfReadinessResponse {
  analysis: {
    evidenceId: string;
    deterministic: true;
    aiUsed: false;
    ocrUsed: false;
    financialRecognition: false;
    version: number;
    parser: string;
    encrypted: boolean;
    textLayerState: UniversalEvidencePdfTextLayerState;
    analyzedStreams: number;
    rawStreams: number;
    flateStreams: number;
    imageStreams: number;
    unsupportedStreams: number;
    limited: boolean;
  };
  requestId?: string;
}

export type UniversalEvidencePdfTextUnavailableReason =
  | 'input_too_large'
  | 'encrypted'
  | 'text_layer_not_detected'
  | 'structural_preflight_incomplete'
  | 'page_limit_exceeded'
  | 'extraction_empty'
  | 'parser_error';

export type UniversalEvidencePdfTextExtraction =
  | {
      evidenceId: string;
      deterministic: true;
      aiUsed: false;
      ocrUsed: false;
      financialRecognition: false;
      state: 'extracted';
      parser: 'unpdf-pdfjs-1';
      text: string;
      totalPages: number;
      extractedPages: number;
      characters: number;
      truncated: boolean;
    }
  | {
      evidenceId: string;
      deterministic: true;
      aiUsed: false;
      ocrUsed: false;
      financialRecognition: false;
      state: 'unavailable';
      parser: 'unpdf-pdfjs-1';
      reason: UniversalEvidencePdfTextUnavailableReason;
      totalPages?: number;
    };

export interface UniversalEvidencePdfTextResponse {
  extraction: UniversalEvidencePdfTextExtraction;
  requestId?: string;
}

async function buildHeaders(organizationId: string) {
  const auth = getAuth();
  const headers = new Headers();
  if (auth.currentUser) {
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  headers.set('Content-Type', 'application/json');
  headers.set('x-organization-id', organizationId);
  return headers;
}

async function parseError(response: Response, fallback: string) {
  const raw = await response.text().catch(() => '');
  let details: any = {};
  try {
    details = raw ? JSON.parse(raw) : {};
  } catch {
    details = { error: raw || `HTTP ${response.status}` };
  }
  const error: any = new Error(details.error || fallback);
  error.details = details;
  error.status = response.status;
  return error;
}

export const universalEvidenceInboxService = {
  async list(
    organizationId: string,
    financeEntityId: string,
    cursor?: string,
    pageSize = 25,
  ): Promise<UniversalEvidenceInboxResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, cursor, pageSize }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_LIST_FAILED');
    }

    return response.json();
  },

  async detail(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
  ): Promise<UniversalEvidenceDetailResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-detail`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, evidenceId }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_DETAIL_FAILED');
    }

    return response.json();
  },

  async preview(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
  ): Promise<UniversalEvidencePreviewResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, evidenceId }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_PREVIEW_FAILED');
    }

    return {
      blob: await response.blob(),
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
      requestId: response.headers.get('x-request-id') || undefined,
    };
  },


  async classify(
    organizationId: string,
    financeEntityId: string,
    input: {
      evidenceId: string;
      expectedVersion: number;
      documentType: UniversalEvidenceDocumentType;
      idempotencyKey: string;
      requestId: string;
    },
  ): Promise<{
    evidenceId: string;
    version: number;
    documentType: UniversalEvidenceDocumentType;
    reviewStatus: 'pending';
    requestId?: string;
  }> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-classify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, ...input }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_CLASSIFY_FAILED');
    }

    return response.json();
  },

  async review(
    organizationId: string,
    financeEntityId: string,
    input: {
      evidenceId: string;
      expectedVersion: number;
      note?: string | null;
      idempotencyKey: string;
      requestId: string;
    },
  ): Promise<{
    evidenceId: string;
    version: number;
    documentType: UniversalEvidenceDocumentType;
    reviewStatus: 'reviewed';
    requestId?: string;
  }> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, ...input }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_REVIEW_FAILED');
    }

    return response.json();
  },

  async inspectPdfTextLayer(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
  ): Promise<UniversalEvidencePdfReadinessResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-pdf-inspect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, evidenceId }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_PDF_INSPECT_FAILED');
    }

    return response.json();
  },

  async extractPdfNativeText(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
  ): Promise<UniversalEvidencePdfTextResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-pdf-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, evidenceId }),
    });

    if (!response.ok) {
      throw await parseError(response, 'UNIVERSAL_EVIDENCE_PDF_TEXT_FAILED');
    }

    return response.json();
  },
};
