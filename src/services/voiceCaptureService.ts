import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import {
  VOICE_CAPTURE_MAX_BYTES,
  VOICE_CAPTURE_MAX_DURATION_MS,
  normalizeVoiceMime,
  type VoiceCaptureLocale,
} from '../../shared/finance/voiceTranscription';

async function headers(organizationId: string) {
  const result = new Headers({ 'Content-Type': 'application/json', 'x-organization-id': organizationId });
  const user = getAuth().currentUser;
  if (user) result.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return result;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

export const voiceCaptureService = {
  async transcribe(input: {
    organizationId: string;
    financeEntityId: string;
    blob: Blob;
    durationMs: number;
    locale: VoiceCaptureLocale;
    consent: true;
  }) {
    if (input.durationMs > VOICE_CAPTURE_MAX_DURATION_MS || input.blob.size > VOICE_CAPTURE_MAX_BYTES) {
      throw new Error('VOICE_CAPTURE_LIMIT_EXCEEDED');
    }
    const mimeType = normalizeVoiceMime(input.blob.type);
    if (!mimeType) throw new Error('VOICE_CAPTURE_UNSUPPORTED');
    const audioBase64 = await blobToBase64(input.blob);
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=voice-transcription-create`, {
      method: 'POST',
      headers: await headers(input.organizationId),
      body: JSON.stringify({
        financeEntityId: input.financeEntityId,
        audioBase64,
        mimeType,
        durationMs: input.durationMs,
        byteSize: input.blob.size,
        consent: input.consent,
        locale: input.locale,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(body.error || 'VOICE_TRANSCRIPTION_FAILED');
      error.code = body.error;
      error.status = response.status;
      throw error;
    }
    return body as {
      transcript: string;
      provider: string;
      model: string;
      vocabularyRevision: string;
      durationMs: number;
      retention: 'not_retained';
      financialEffect: false;
    };
  },
};
