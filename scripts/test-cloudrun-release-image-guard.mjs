import assert from 'node:assert/strict';
import { verifyCloudRunReleaseImage } from './verify-cloudrun-release-image.mjs';

const parent = 'sha256:' + 'a'.repeat(64);
const child = 'sha256:' + 'b'.repeat(64);
const other = 'sha256:' + 'c'.repeat(64);
const config = 'sha256:' + 'd'.repeat(64);
const imageRef = 'us-central1-docker.pkg.dev/millionsnest/example/image@' + parent;
const revisionName = 'nestfinance-api-cg123a1';
const baseRevision = (digest = child) => ({
  metadata: { name: revisionName },
  spec: { containers: [{ image: imageRef }] },
  status: { imageDigest: 'us-central1-docker.pkg.dev/millionsnest/example/image@' + digest,
    conditions: [{ type: 'Ready', status: 'True' }] },
});
const index = {
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    { mediaType: 'application/vnd.oci.image.manifest.v1+json',
      platform: { os: 'linux', architecture: 'amd64' }, digest: child },
    { mediaType: 'application/vnd.oci.image.manifest.v1+json',
      platform: { os: 'unknown', architecture: 'unknown' }, digest: other },
  ],
};
const direct = { mediaType: 'application/vnd.oci.image.manifest.v1+json',
  config: { digest: config }, layers: [] };
const verify = (revision = baseRevision(), manifest = index, expected = {}) =>
  verifyCloudRunReleaseImage({ revision, manifest, imageRef, revisionName, artifactDigest: parent, ...expected });
const good = (result, message) => assert.equal(result.ok, true, message);
const bad = (result, message) => assert.equal(result.ok, false, message);

good(verify(), 'OCI index child manifest is valid when digest pinned and revision Ready');
good(verify(baseRevision(parent)), 'OCI index digest itself also valid');
good(verify(baseRevision(parent), direct), 'single-platform image digest must equal pinned digest');
bad(verify(baseRevision(other)), 'unrelated OCI digest never accepted');
bad(verify(baseRevision(child), direct), 'single-platform image cannot borrow child digest');
bad(verify({ ...baseRevision(), metadata: { name: 'wrong' } }), 'wrong revision denied');
bad(verify({ ...baseRevision(), spec: { containers: [{ image: 'another:image' }] } }), 'wrong image reference denied');
bad(verify({ ...baseRevision(), status: { ...baseRevision().status, conditions: [{ type: 'Ready', status: 'False' }] } }), 'unready revision denied');
bad(verify(baseRevision(), { ...index, manifests: [...index.manifests, index.manifests[0]] }), 'ambiguous linux/amd64 manifest denied');
bad(verify(baseRevision(), { ...index, manifests: [index.manifests[1]] }), 'missing amd64 manifest denied');
bad(verify(baseRevision(), index, { artifactDigest: other }), 'incorrect immutable expected digest denied');
bad(verify(baseRevision(), { ...direct, config: {} }), 'incomplete direct manifest denied');
bad(verify({ ...baseRevision(), status: { ...baseRevision().status, imageDigest: 'sha256:fake' } }), 'invalid resolved digest denied');
bad(verify({ ...baseRevision(), spec: { containers: [{ image: imageRef }, { image: imageRef }] } }), 'extra container denied');
console.log('Cloud Run release digest binding: 14 scenarios passed.');
