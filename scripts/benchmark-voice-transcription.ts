import { scoreVoiceTranscript } from '../shared/finance/voiceTranscription';

export type VoiceBenchmarkCase = {
  id: string;
  reference: string;
  baseline25: string;
  candidate35: string;
};

export function compareVoiceModels(cases: VoiceBenchmarkCase[]) {
  const scored = cases.map((item) => ({
    id: item.id,
    baseline: scoreVoiceTranscript(item.reference, item.baseline25),
    candidate: scoreVoiceTranscript(item.reference, item.candidate35),
  }));
  const average = (key: 'baseline' | 'candidate') => scored.length
    ? scored.reduce((sum, item) => sum + item[key].wordAccuracy, 0) / scored.length
    : 0;
  const baselineAccuracy = average('baseline');
  const candidateAccuracy = average('candidate');
  return {
    sampleCount: scored.length,
    baselineAccuracy,
    candidateAccuracy,
    accuracyDeltaPoints: (candidateAccuracy - baselineAccuracy) * 100,
    recommendation: candidateAccuracy - baselineAccuracy >= 0.10 ? 'candidate_meets_accuracy_gate' : 'keep_baseline',
    scored,
  };
}

if (process.argv[1]?.includes('benchmark-voice-transcription')) {
  const fixture = process.env.NESTFINANCE_VOICE_BENCHMARK_JSON;
  if (!fixture) {
    console.log(JSON.stringify({ status: 'READY', liveCalls: false, note: 'Provide saved benchmark transcripts via NESTFINANCE_VOICE_BENCHMARK_JSON. Production audio is never duplicated.' }));
  } else {
    const cases = JSON.parse(fixture) as VoiceBenchmarkCase[];
    console.log(JSON.stringify(compareVoiceModels(cases), null, 2));
  }
}
