import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const today = read('src/pages/finance/TodayActionCenter.tsx');
const home = read('src/pages/finance/CountPage.tsx');
const start = read('src/pages/finance/count/CountStartJourney.tsx');
const session = read('src/pages/finance/count/CountSessionPage.tsx');
const draft = read('src/services/countDraftPersistence.ts');
const training = read('src/pages/finance/count/CountTrainingPage.tsx');
const voice = read('src/pages/finance/count/CountVoiceQuickPage.tsx');
const routes = read('src/app/router/routes.ts');
const router = read('src/app/router/index.tsx');

assert.ok(today.includes("action: 'Iniciar contagem'"));
assert.ok(today.includes('navigate(countActionRoute)'));
assert.ok(today.includes(': APP_ROUTES.count;'));
assert.ok(today.includes("APP_ROUTES.countSession.replace(':sessionId', activeCount.id)"));
assert.ok(today.includes('{canCount ? ('));

assert.ok(home.includes('CountStartJourney'));
assert.ok(home.includes("input.mode === 'free_form'"));
assert.ok(home.includes("input.mode === 'paper'"));
assert.ok(home.includes("input.mode === 'voice'"));
assert.ok(home.includes('countPaperService.generate'));

assert.ok(start.includes("step === 'context'"));
assert.ok(start.includes('copy.contextTitle'));
assert.ok(start.includes('copy.detailsTitle'));
assert.ok(start.includes('copy.methodTitle'));
assert.ok(start.includes('title={title}'));
assert.ok(start.includes('FlowStepHeader'));
assert.ok(start.includes("ACTIVE_STATUSES"));
assert.ok(start.includes('copy.continue'));
assert.ok(start.includes('copy.today'));
assert.ok(start.includes('copy.other'));
assert.ok(start.includes('APP_ROUTES.countTraining'));
assert.ok(start.includes("start('digital')"));
assert.ok(start.includes("start('free_form')"));
assert.ok(start.includes("start('paper')"));
assert.ok(start.includes("start('voice')"));
assert.ok(start.includes('entityName'));
assert.ok(start.includes('localDateInputValue()'));
assert.ok(start.includes('SpeakInstructionButton'));

assert.ok(draft.includes("nestfinance_count_draft_v1"));
assert.ok(draft.includes('organizationId'));
assert.ok(draft.includes('financeEntityId'));
assert.ok(draft.includes('sessionId'));
assert.ok(draft.includes('localStorage.setItem'));
assert.ok(draft.includes('localStorage.getItem'));

assert.ok(session.includes('countDraftPersistence.load'));
assert.ok(session.includes('countDraftPersistence.save'));
assert.ok(session.includes("window.addEventListener('online'"));
assert.ok(session.includes("window.addEventListener('offline'"));
assert.ok(session.includes("setCloudSaveState('local')"));
assert.ok(session.includes("setCloudSaveState('saved')"));
assert.ok(session.includes('saveFirstCount'));
assert.ok(session.includes('1200'));
assert.ok(session.includes('SpeakInstructionButton'));

assert.ok(training.includes('Modo de treinamento'));
assert.ok(training.includes('Este treino não chama nenhuma API financeira.'));
assert.ok(!training.includes('countService'));
assert.ok(!training.includes('fetch('));

assert.ok(voice.includes('webkitSpeechRecognition'));
assert.ok(voice.includes('SpeechRecognition'));
assert.ok(voice.includes('localStorage.setItem'));
assert.ok(voice.includes('countService.saveFirstCount'));
assert.ok(voice.includes("method: 'total'"));
assert.ok(voice.includes('Você sempre verá o número antes de salvar.'));

assert.ok(routes.includes("countTraining: '/finance/count/training'"));
assert.ok(routes.includes("countVoice: '/finance/count/:sessionId/voice'"));
assert.ok(router.includes('<CountTrainingPage />'));
assert.ok(router.includes('<CountVoiceQuickPage />'));

for (const source of [home, start, session, training, voice]) {
  assert.ok(!source.includes('approve-for-posting'));
  assert.ok(!source.includes('posting-plan'));
  assert.ok(!source.includes('financeJournalEntries'));
}

console.log('✅ Roadmap Cycle 03 guided Count journey gate passed');
