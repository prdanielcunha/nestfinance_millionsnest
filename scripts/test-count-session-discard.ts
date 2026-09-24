import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const home = read('src/pages/finance/CountPage.tsx');
const session = read('src/pages/finance/count/CountSessionPage.tsx');
const service = read('src/services/countService.ts');
const listHandler = read('server/vercel-handlers/finance/countSessionsList.ts');
const detailHandler = read('server/vercel-handlers/finance/countSessionsDetail.ts');
const discardHandler = read('server/vercel-handlers/finance/countSessionsDiscard.ts');
const gateway = read('api/finance-gateway.ts');

assert.ok(service.includes("'count-sessions-discard'"));
assert.ok(gateway.includes("case 'count-sessions-discard': return countSessionsDiscard(req, res);"));

assert.ok(
  discardHandler.includes("session.status !== 'counting_a'") &&
    discardHandler.includes("throw new Error('COUNT_DISCARD_NOT_ALLOWED')"),
  'only first-stage count drafts can be discarded',
);
assert.ok(
  discardHandler.includes("Number(session.version) !== expectedVersion") &&
    discardHandler.includes("COUNT_VERSION_CONFLICT"),
  'discard is protected by optimistic versioning',
);
assert.ok(
  discardHandler.includes("status: 'discarded'") &&
    discardHandler.includes("action: 'count.session_discarded'"),
  'discard is a soft-delete with canonical audit history',
);
assert.ok(
  listHandler.includes("doc.data()?.status !== 'discarded'"),
  'discarded sessions are removed from active count lists',
);
assert.ok(
  detailHandler.includes("data.status === 'discarded'") &&
    detailHandler.includes("COUNT_SESSION_NOT_FOUND"),
  'discarded sessions cannot be reopened through the regular detail endpoint',
);
assert.ok(
  home.includes('copy.discardSession') &&
    home.includes('setDiscardTarget(item)') &&
    home.includes('countDraftPersistence.clear'),
  'recent count cards expose discard and clear device-local draft state',
);
assert.ok(
  session.includes('copy.discardSession') &&
    session.includes('countService.discard') &&
    session.includes("navigate(APP_ROUTES.count, { replace: true })"),
  'the first-count workspace also exposes discard and exits safely after success',
);

assert.ok(
  session.includes('autosaveCopy.discardDraft') &&
    session.includes("restoredDraft ? autosaveCopy.restored : autosaveCopy.draftSaved") &&
    session.includes("grid-cols-[minmax(0,1fr)_auto]"),
  'discard is contextualized inside the compact draft status surface',
);
assert.ok(
  !session.includes('className="shrink-0"\n                disabled={discarding || saving || cloudSaveState === \'saving\'}'),
  'the destructive discard control no longer occupies the count header',
);
assert.ok(
  home.includes('aria-labelledby="discard-count-title"') &&
    session.includes('aria-labelledby="discard-count-session-title"'),
  'both discard entry points require accessible confirmation dialogs',
);

console.log('✅ Count session discard is draft-only, version-safe, audited and exposed in both count UIs');
