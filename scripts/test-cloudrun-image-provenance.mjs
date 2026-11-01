import assert from 'node:assert/strict';
import { verifyCloudRunImageProvenance } from './verify-cloudrun-image-provenance.mjs';

const index = 'sha256:' + 'a'.repeat(64);
const child = 'sha256:' + 'b'.repeat(64);
const other = 'sha256:' + 'c'.repeat(64);
const attestation = 'sha256:' + 'd'.repeat(64);
const expectedRevision = 'nestfinance-api-synthetic-release';
const manifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    { digest: child, mediaType: 'application/vnd.oci.image.manifest.v1+json', platform: { os: 'linux', architecture: 'amd64' } },
    { digest: attestation, mediaType: 'application/vnd.oci.image.manifest.v1+json', platform: { os: 'unknown', architecture: 'unknown' } },
  ],
};
function revision(digest, ready = true, name = expectedRevision) {
  return {
    metadata: { name },
    status: {
      imageDigest: 'registry.example.test/app@' + digest,
      conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }],
    },
  };
}
function evaluate(registryManifest, target, expectedRegistryDigest = index) {
  return verifyCloudRunImageProvenance({
    registryManifest, revision: target, expectedRevision, expectedRegistryDigest,
  });
}
assert.equal(evaluate(manifest, revision(child)).passed, true, 'linux/amd64 OCI child is the approved runtime');
assert.equal(evaluate(manifest, revision(index)).passed, true, 'root OCI index is an approved immutable digest');
for (const value of [attestation, other]) {
  assert.equal(evaluate(manifest, revision(value)).passed, false, 'reject unapproved or attestation digest');
}
assert.equal(evaluate(manifest, revision(child, false)).passed, false, 'Ready must be True');
assert.equal(evaluate(manifest, revision(child, true, 'another-release')).passed, false, 'revision name must match exactly');
assert.equal(evaluate({ ...manifest, manifests: [] }, revision(child)).passed, false, 'empty OCI index is unprovable');
assert.equal(evaluate({ ...manifest, manifests: manifest.manifests.concat(manifest.manifests[0]) }, revision(child)).passed, false, 'ambiguous linux/amd64 platform rejected');
assert.equal(evaluate({ ...manifest, mediaType: 'unknown/type' }, revision(index)).passed, false, 'unknown index types rejected');
assert.equal(evaluate(manifest, revision(child), other).passed, false, 'wrong tagged registry index cannot authorize child');
const single = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: other }, layers: [] };
assert.equal(evaluate(single, revision(index)).passed, true, 'single manifest uses its original content-addressed digest');
assert.equal(evaluate(single, revision(child)).passed, false, 'single manifest cannot authorize a different manifest');
console.log('✓ Immutable OCI image ancestry and exact Cloud Run revision guard: all 12 checks passed');
