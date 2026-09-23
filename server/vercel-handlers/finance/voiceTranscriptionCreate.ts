import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  VOICE_CAPTURE_MAX_BASE64_CHARS,
  isVoiceCaptureByteSize,
  isVoiceCaptureDuration,
  normalizeVoiceMime,
  normalizeVoiceTranscript,
  type VoiceCaptureLocale,
} from '../../../shared/finance/voiceTranscription.js';
import { getVoiceTranscriptionProvider } from './voiceTranscriptionProvider.js';

const localeValues = new Set<VoiceCaptureLocale>(['PT', 'EN', 'ES']);

function looksLikeAudio(bytes: Buffer, mimeType: string) {
  if (mimeType.startsWith('audio/webm')) {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (mimeType.startsWith('audio/ogg')) return bytes.subarray(0, 4).toString('ascii') === 'OggS';
  if (mimeType === 'audio/mp4') return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, audioBase64, mimeType: rawMime, durationMs, byteSize, consent, locale } = req.body || {};
    const mimeType = typeof rawMime === 'string' ? normalizeVoiceMime(rawMime) : null;
    if (
      typeof financeEntityId !== 'string' ||
      typeof audioBase64 !== 'string' ||
      audioBase64.length > VOICE_CAPTURE_MAX_BASE64_CHARS ||
      !mimeType ||
      !isVoiceCaptureDuration(durationMs) ||
      !isVoiceCaptureByteSize(byteSize) ||
      consent !== true ||
      !localeValues.has(locale)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const bytes = Buffer.from(audioBase64, 'base64');
    if (bytes.length !== byteSize || !isVoiceCaptureByteSize(bytes.length) || !looksLikeAudio(bytes, mimeType)) {
      return res.status(422).json({ error: 'VOICE_AUDIO_INVALID' });
    }

    const result = await getVoiceTranscriptionProvider().transcribe({ bytes, mimeType, locale });
    const transcript = normalizeVoiceTranscript(result.transcript);
    if (!transcript) return res.status(422).json({ error: 'VOICE_TRANSCRIPTION_EMPTY' });

    return res.status(200).json({
      transcript,
      provider: result.provider,
      model: result.model,
      vocabularyRevision: result.vocabularyRevision,
      durationMs,
      audioSha256: createHash('sha256').update(bytes).digest('hex'),
      retention: 'not_retained',
      financialEffect: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message.includes('VOICE_TRANSCRIPTION_EMPTY')) return res.status(422).json({ error: 'VOICE_TRANSCRIPTION_EMPTY' });
    if (message.includes('VOICE_TRANSCRIPTION_NOT_CONFIGURED') || message.includes('VOICE_TRANSCRIBE_API_KEY_REQUIRED') || message.includes('VOICE_TRANSCRIBE_SDK_UNAVAILABLE')) {
      return res.status(503).json({ error: 'VOICE_TRANSCRIPTION_UNAVAILABLE' });
    }
    if (message.includes('VOICE_TRANSCRIPTION_TIMEOUT')) return res.status(504).json({ error: 'VOICE_TRANSCRIPTION_TIMEOUT' });
    console.error('Voice Transcription Error:', error);
    return res.status(500).json({ error: 'VOICE_TRANSCRIPTION_FAILED' });
  }
}
