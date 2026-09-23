import { GoogleGenAI } from '@google/genai';
import {
  VOICE_FINANCE_VOCABULARY,
  VOICE_TRANSCRIPTION_VOCABULARY_REVISION,
  normalizeVoiceTranscript,
  type VoiceCaptureLocale,
  type VoiceCaptureMime,
} from '../../../shared/finance/voiceTranscription.js';

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_NESTFINANCE_VOICE_TRANSCRIPTION_PROVIDER');
const PROVIDER_TIMEOUT_MS = 25_000;

export type VoiceTranscriptionResult = {
  transcript: string;
  provider: 'gemini_interactions' | 'vertex_genai';
  model: string;
  vocabularyRevision: string;
};

export interface VoiceTranscriptionProvider {
  transcribe(input: {
    bytes: Buffer;
    mimeType: VoiceCaptureMime;
    locale: VoiceCaptureLocale;
  }): Promise<VoiceTranscriptionResult>;
}

function localeCode(locale: VoiceCaptureLocale) {
  return locale === 'PT' ? 'pt-BR' : locale === 'ES' ? 'es-ES' : 'en-US';
}

function prompt(locale: VoiceCaptureLocale) {
  const language = locale === 'PT' ? 'Brazilian Portuguese' : locale === 'ES' ? 'Spanish' : 'English';
  return [
    `Transcribe this short financial voice note in ${language}.`,
    'Return only the transcript, without commentary or JSON.',
    'Preserve currency values, dates, Pix/payment-method words, tithe/offering terms, and corrections the speaker makes.',
    `Useful vocabulary: ${VOICE_FINANCE_VOCABULARY.join(', ')}.`,
  ].join(' ');
}

async function callGenerateContent(input: {
  bytes: Buffer;
  mimeType: VoiceCaptureMime;
  locale: VoiceCaptureLocale;
  model: string;
  apiKey?: string;
  project?: string;
  location?: string;
}) {
  const ai = input.apiKey
    ? new GoogleGenAI({ apiKey: input.apiKey })
    : new GoogleGenAI({ vertexai: true, project: input.project!, location: input.location || 'global' });

  const response: any = await Promise.race([
    (ai.models as any).generateContent({
      model: input.model,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt(input.locale) },
          { inlineData: { data: input.bytes.toString('base64'), mimeType: input.mimeType } },
        ],
      }],
      config: { temperature: 0 },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('VOICE_TRANSCRIPTION_TIMEOUT')), PROVIDER_TIMEOUT_MS)),
  ]);
  const raw = typeof response?.text === 'string'
    ? response.text
    : typeof response?.text === 'function'
      ? response.text()
      : '';
  const transcript = normalizeVoiceTranscript(raw);
  if (!transcript) throw new Error('VOICE_TRANSCRIPTION_EMPTY');
  return transcript;
}

async function callDedicatedTranscribe(input: {
  bytes: Buffer;
  mimeType: VoiceCaptureMime;
  locale: VoiceCaptureLocale;
  apiKey: string;
  model: string;
}) {
  const ai: any = new GoogleGenAI({ apiKey: input.apiKey });
  if (!ai?.files?.upload || !ai?.interactions?.create) throw new Error('VOICE_TRANSCRIBE_SDK_UNAVAILABLE');

  const { writeFile, unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const extension = input.mimeType.includes('mp4') ? 'm4a' : input.mimeType.includes('ogg') ? 'ogg' : 'webm';
  const path = join(tmpdir(), `nestfinance-voice-${crypto.randomUUID()}.${extension}`);
  await writeFile(path, input.bytes);
  try {
    const uploaded = await ai.files.upload({
      file: path,
      config: { mime_type: input.mimeType },
    });
    const interaction = await Promise.race([
      ai.interactions.create({
        model: input.model,
        input: [{ type: 'audio', uri: uploaded.uri, mime_type: uploaded.mimeType || input.mimeType }],
        generation_config: {
          transcription_config: {
            language_codes: [localeCode(input.locale)],
            custom_vocabulary: [...VOICE_FINANCE_VOCABULARY],
            mode: 'smart',
          },
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('VOICE_TRANSCRIPTION_TIMEOUT')), PROVIDER_TIMEOUT_MS)),
    ]) as any;
    const transcript = normalizeVoiceTranscript(interaction?.output_text);
    if (!transcript) throw new Error('VOICE_TRANSCRIPTION_EMPTY');
    return transcript;
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

function productionProvider(): VoiceTranscriptionProvider {
  return {
    async transcribe(input) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
      const model = process.env.NESTFINANCE_VOICE_TRANSCRIBE_MODEL || 'gemini-2.5-flash-lite';

      if (model === 'gemini-3.5-transcribe') {
        if (!apiKey) throw new Error('VOICE_TRANSCRIBE_API_KEY_REQUIRED');
        const transcript = await callDedicatedTranscribe({ ...input, apiKey, model });
        return {
          transcript,
          provider: 'gemini_interactions',
          model,
          vocabularyRevision: VOICE_TRANSCRIPTION_VOCABULARY_REVISION,
        };
      }

      const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '';
      if (!apiKey && !project) throw new Error('VOICE_TRANSCRIPTION_NOT_CONFIGURED');
      const transcript = await callGenerateContent({
        ...input,
        model,
        apiKey: apiKey || undefined,
        project: project || undefined,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      });
      return {
        transcript,
        provider: apiKey ? 'gemini_interactions' : 'vertex_genai',
        model,
        vocabularyRevision: VOICE_TRANSCRIPTION_VOCABULARY_REVISION,
      };
    },
  };
}

export function getVoiceTranscriptionProvider(): VoiceTranscriptionProvider {
  if (process.env.NODE_ENV === 'test' && (globalThis as any)[TEST_PROVIDER_SYMBOL]) {
    return (globalThis as any)[TEST_PROVIDER_SYMBOL] as VoiceTranscriptionProvider;
  }
  return productionProvider();
}
