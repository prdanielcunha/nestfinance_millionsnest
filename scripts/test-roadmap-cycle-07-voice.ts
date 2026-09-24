import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  VOICE_CAPTURE_MAX_BYTES,
  VOICE_CAPTURE_MAX_DURATION_MS,
  scoreVoiceTranscript,
} from '../shared/finance/voiceTranscription';
import { compareVoiceModels } from './benchmark-voice-transcription';

const component = readFileSync('src/pages/finance/capture/RecordedVoiceCapture.tsx', 'utf8');
const endpoint = readFileSync('server/vercel-handlers/finance/voiceTranscriptionCreate.ts', 'utf8');
const provider = readFileSync('server/vercel-handlers/finance/voiceTranscriptionProvider.ts', 'utf8');
const quick = readFileSync('src/pages/finance/capture/UniversalQuickTextEntry.tsx', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');

assert.equal(VOICE_CAPTURE_MAX_DURATION_MS, 60_000);
assert.ok(VOICE_CAPTURE_MAX_BYTES <= 1_572_864);
assert.match(component, /MediaRecorder/);
assert.match(component, /getUserMedia/);
assert.match(component, /controls/);
assert.match(component, /consent/);
assert.match(component, /mode = 'primary'/);
assert.match(endpoint, /retention: 'not_retained'/);
assert.match(endpoint, /financialEffect: false/);
assert.doesNotMatch(endpoint, /getStorage|firebasestorage|bucket\(/);
assert.match(provider, /gemini-2\.5-flash-lite/);
assert.match(provider, /gemini-3\.5-transcribe/);
assert.match(provider, /custom_vocabulary/);
assert.match(quick, /RecordedVoiceCapture/);
assert.match(quick, /parseUniversalTextIntent/);
assert.match(gateway, /voice-transcription-create/);

const score = scoreVoiceTranscript('Recebi 500 reais de oferta no Pix hoje', 'Recebi 500 reais de oferta no Pix hoje');
assert.equal(score.wordAccuracy, 1);
const benchmark = compareVoiceModels([{
  id: 'ptbr-finance',
  reference: 'Recebi quinhentos reais de oferta no Pix hoje',
  baseline25: 'Recebi quinhentos reais de oferta no Pix',
  candidate35: 'Recebi quinhentos reais de oferta no Pix hoje',
}]);
assert.equal(benchmark.sampleCount, 1);
assert.ok(benchmark.candidateAccuracy > benchmark.baselineAccuracy);

console.log('Roadmap Cycle 07 voice capture gate: PASS');
