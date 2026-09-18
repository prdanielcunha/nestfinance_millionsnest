import assert from 'node:assert/strict';
import {
  UNIVERSAL_EVIDENCE_DOCUMENT_TYPES,
  isUniversalEvidenceDocumentType,
  normalizeUniversalEvidenceReviewNote,
} from '../shared/finance/universalEvidenceReview.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

for (const type of UNIVERSAL_EVIDENCE_DOCUMENT_TYPES) {
  verify(isUniversalEvidenceDocumentType(type), `${type} is an accepted document type`);
}
verify(!isUniversalEvidenceDocumentType('random_document'), 'unknown document types fail closed');
verify(
  normalizeUniversalEvidenceReviewNote('  conferido   com\nextrato  ') === 'conferido com extrato',
  'review notes are normalized without changing meaning',
);
verify(normalizeUniversalEvidenceReviewNote('   ') === null, 'blank review note becomes null');

assert.throws(
  () => normalizeUniversalEvidenceReviewNote('x'.repeat(501)),
  /EVIDENCE_INVALID_REVIEW_NOTE/,
);
passed++;
console.log('✅ oversized review notes fail closed');

console.log(`\nUniversal Evidence Review Model totals: ${passed} Passed`);
