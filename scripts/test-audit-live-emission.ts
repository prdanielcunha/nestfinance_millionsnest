import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const financeDir = 'server/vercel-handlers/finance';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return nested.flat().filter((file) => file.endsWith('.ts'));
}

const helper = await readFile(
  path.join(financeDir, 'auditFactProjection.ts'),
  'utf8',
);
assert.ok(helper.includes('stageCanonicalAuditRecord('));
assert.ok(helper.includes('stageCanonicalAuditCreate('));
assert.ok(helper.includes("eventType: 'AUDIT_EVENT_RECORDED'"));
assert.ok(helper.includes("sourceRefs: [{ kind: 'audit', ref: auditRef }]"));
assert.ok(helper.includes('historicalEventInferred: false'));

const files = await walk(financeDir);
const explicitExemptions = new Map<string, string>([
  [
    path.join(financeDir, 'setupInitialize.ts'),
    'organization-wide setup audit has no financeEntity scope and is not a cross-app finance-entity event',
  ],
  [
    path.join(financeDir, 'auditList.ts'),
    'read-only canonical audit timeline',
  ],
  [
    path.join(financeDir, 'accessHelpers.ts'),
    'repository reference factory only',
  ],
  [
    path.join(financeDir, 'auditFactProjection.ts'),
    'canonical helper implementation',
  ],
]);

const rawAuditWritePatterns = [
  /\b(?:t|transaction)\.(?:set|create)\(\s*auditRef\b/u,
  /\b(?:t|transaction)\.(?:set|create)\(\s*auditDocRef\b/u,
  /\b(?:t|transaction)\.(?:set|create)\(\s*sessionAuditRef\b/u,
  /\b(?:t|transaction)\.(?:set|create)\(\s*captureAuditRef\b/u,
  /\b(?:t|transaction)\.(?:set|create)\(\s*context\.repository\.getAuditRef\(\)\.doc\(/u,
];

const writers: string[] = [];
const bypasses: string[] = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const mentionsAudit =
    source.includes("collection('financeAuditLogs')") ||
    source.includes('getAuditRef()');
  if (!mentionsAudit || explicitExemptions.has(file)) continue;

  const writesAudit =
    rawAuditWritePatterns.some((pattern) => pattern.test(source)) ||
    source.includes('stageCanonicalAuditRecord(') ||
    source.includes('stageCanonicalAuditCreate(');
  if (!writesAudit) continue;

  writers.push(file);
  const bypassesRawWrite = rawAuditWritePatterns.some((pattern) => pattern.test(source));
  const usesCanonicalHelper =
    source.includes('stageCanonicalAuditRecord(') ||
    source.includes('stageCanonicalAuditCreate(');
  if (bypassesRawWrite || !usesCanonicalHelper) bypasses.push(file);
}

assert.ok(writers.length >= 40, 'expected broad live audit writer inventory');
assert.deepStrictEqual(
  bypasses,
  [],
  'every financeEntity-scoped audit writer must use the canonical atomic helper',
);

for (const [file, reason] of explicitExemptions) {
  const source = await readFile(file, 'utf8');
  assert.ok(source.length > 0, file + ' exemption must point to a real source file: ' + reason);
}

const crossApp = await readFile(
  'shared/intelligence/financeCrossAppEvents.ts',
  'utf8',
);
assert.ok(
  crossApp.includes("AUDIT_EVENT_RECORDED: {") &&
    crossApp.includes("state: 'reserved'"),
  'AUDIT_EVENT_RECORDED stays reserved until historical legacy scope is certified',
);

console.log(
  '✅ Live audit emission inventory certifies ' +
    writers.length +
    ' financeEntity-scoped writers with zero raw-write bypasses',
);
