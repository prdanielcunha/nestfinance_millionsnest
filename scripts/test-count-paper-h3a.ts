import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  buildCountPaperQrPayload,
  createCountPaperQrMatrix,
} from '../shared/finance/countPaper';
import { COUNT_PAPER_COPY } from '../src/pages/finance/count/countPaperCopy';

let passed = 0;
let failed = 0;
function verify(name: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.error(`❌ ${name}`);
  }
}

const generateHandler = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countPaperFormsGenerate.ts'), 'utf8');
const detailHandler = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countPaperFormsDetail.ts'), 'utf8');
const helpers = fs.readFileSync(path.resolve('server/vercel-handlers/finance/countPaperHelpers.ts'), 'utf8');
const service = fs.readFileSync(path.resolve('src/services/countPaperService.ts'), 'utf8');
const hub = fs.readFileSync(path.resolve('src/pages/finance/count/CountPaperFormsPage.tsx'), 'utf8');
const form = fs.readFileSync(path.resolve('src/pages/finance/count/CountPaperFormPage.tsx'), 'utf8');
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');
const gateway = fs.readFileSync(path.resolve('api/finance-gateway.ts'), 'utf8');

console.log('Running Count Paper H3A checks...');

const identity = {
  formId: 'cpf_aaaaaaaaaaaaaaaa',
  templateVersion: COUNT_PAPER_TEMPLATE_VERSION,
  checksum: 'bbbbbbbbbbbbbbbbbbbbbbbb',
};
const payload = buildCountPaperQrPayload(identity);
const parsed = JSON.parse(payload);
verify('QR payload exposes exactly three opaque identity keys', JSON.stringify(Object.keys(parsed)) === JSON.stringify(['formId', 'templateVersion', 'checksum']));
verify('QR payload does not expose tenant or financial fields', !/(organizationId|financeEntityId|countSessionId|amount|total|cnpj|bank|countA|countB)/i.test(payload));
verify('QR payload remains compact ASCII for fixed Version 6-M symbol', payload.length <= 106 && /^[\x20-\x7E]+$/.test(payload));

const matrix = createCountPaperQrMatrix(payload);
verify('QR matrix is fixed Version 6 size', matrix.length === 41 && matrix.every((row) => row.length === 41));
const matrixDigest = createHash('sha256')
  .update(Buffer.from(matrix.flat().map((value) => value ? 1 : 0)))
  .digest('hex');
verify('QR encoder matches certified Version 6-M / mask 0 reference matrix', matrixDigest === 'd347f717b599015d1c67ec8a2feea366a4c21c74427c7b62260d93000ad76aa7');

verify('paper generation uses canonical create-draft capability', generateHandler.includes("resolveFinanceRequestContext(\n      req,\n      'finance.create_drafts'"));
verify('paper detail uses canonical finance.view capability', detailHandler.includes("resolveFinanceRequestContext(req, 'finance.view')"));
verify('paper records live below the requested finance entity', generateHandler.includes(".collection('financeEntities')") && generateHandler.includes(".collection('countPaperForms')"));
verify('Count A paper can only be issued while Count A is active', generateHandler.includes("stage === 'count_a' && session.status !== 'counting_a'"));
verify('Count B paper requires first-count evidence and active A/B state', generateHandler.includes('COUNT_PAPER_SECOND_COUNT_NOT_READY') && generateHandler.includes("['counting_a', 'counting_b'].includes(session.status)"));
verify('paper identity checksum includes server-known tenant/session context', helpers.includes('organizationId') && helpers.includes('financeEntityId') && helpers.includes('countSessionId') && helpers.includes("schema: 'nestfinance-count-paper-v1'"));
verify('detail recomputes checksum and QR payload before rendering', detailHandler.includes('computeCountPaperChecksum') && detailHandler.includes('expectedPayload !== data.qrPayload'));
verify('paper backend has no ledger posting or balance collections', !/financeTransactions|financeJournalEntries|financeJournalLines|financeAggregates|posting-real|ledger-post/.test(`${generateHandler}\n${detailHandler}\n${helpers}`));

verify('paper service only exposes generate/detail gateway operations', service.includes("'count-paper-forms-generate'") && service.includes("'count-paper-forms-detail'"));
verify('gateway certifies both H3A operations', gateway.includes("case 'count-paper-forms-generate'") && gateway.includes("case 'count-paper-forms-detail'"));
verify('paper routes are explicit and lazy-loaded', routes.includes("countPaperForms: '/finance/count/forms'") && routes.includes("countPaperForm: '/finance/count/forms/:formId'") && router.includes('CountPaperFormsPage') && router.includes('CountPaperFormPage'));
verify('generator supports Count A and Count B without displaying hidden material', hub.includes("generate(item, 'count_a')") && hub.includes("generate(item, 'count_b')") && !/firstCountTotalCents\s*[})]/.test(hub));
verify('print form never references Count A/B material values', !/countA|countB|comparison|recountAttempts|totalCents/.test(form));
verify('print layout declares A4 and print-only visibility contract', form.includes('@page { size: A4 portrait;') && form.includes('.count-paper-print'));
verify('print output is explicitly black/white compatible', form.includes('background: #fff !important') && form.includes('color: #000 !important'));
verify('paper form preserves Count field order', form.indexOf('copy.tithes') < form.indexOf('copy.offerings') && form.indexOf('copy.offerings') < form.indexOf('copy.otherIncome') && form.indexOf('copy.otherIncome') < form.indexOf('copy.pix'));
verify('paper form includes handwritten responsibility/signature fields', form.includes('copy.counter') && form.includes('copy.checker') && form.includes('copy.signature'));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = COUNT_PAPER_COPY[language];
  verify(`${language} paper copy is complete`, Boolean(copy.hubTitle && copy.generateA && copy.generateB && copy.formTitle && copy.qrNote && copy.noPosting));
}

console.log(`\nCount Paper H3A totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
