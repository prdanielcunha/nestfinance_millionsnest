import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';

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
}

export interface UniversalEvidenceInboxSummary {
  total: number;
  accepted: number;
  duplicate: number;
  awaitingUpload: number;
}

export interface UniversalEvidenceInboxResponse {
  items: UniversalEvidenceInboxItem[];
  nextCursor?: string;
  hasMore: boolean;
  summary: UniversalEvidenceInboxSummary;
  requestId?: string;
}

export const universalEvidenceInboxService = {
  async list(
    organizationId: string,
    financeEntityId: string,
    cursor?: string,
    pageSize = 25,
  ): Promise<UniversalEvidenceInboxResponse> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, cursor, pageSize }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let details: any = {};
      try {
        details = raw ? JSON.parse(raw) : {};
      } catch {
        details = { error: raw || `HTTP ${response.status}` };
      }
      const error: any = new Error(details.error || 'UNIVERSAL_EVIDENCE_LIST_FAILED');
      error.details = details;
      error.status = response.status;
      throw error;
    }

    return response.json();
  },
};
