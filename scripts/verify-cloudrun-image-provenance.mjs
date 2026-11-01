// Verify that Cloud Run resolves to the exact registry image or the linux/amd64
// child manifest of that immutable OCI index. Never accept arbitrary digests.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const MANIFEST_MEDIA = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const INDEX_MEDIA = new Set([
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);

export function verifyCloudRunImageProvenance({
  registryManifest, revision, expectedRevision, expectedRegistryDigest,
}) {
  const details = {
    revisionMatches: revision?.metadata?.name === expectedRevision,
    ready: revision?.status?.conditions?.some(
      (condition) => condition.type === 'Ready' && condition.status === 'True',
    ) === true,
    registryDigestValid: DIGEST_RE.test(expectedRegistryDigest || ''),
    registryManifestValid: false,
    platformChildPresent: false,
    revisionDigestPresent: false,
    digestMatches: false,
  };
  const sourceDigest = typeof revision?.status?.imageDigest === 'string'
    ? revision.status.imageDigest.match(/sha256:[a-f0-9]{64}$/)?.[0]
    : null;
  details.revisionDigestPresent = Boolean(sourceDigest);
  const allowed = new Set();
  if (details.registryDigestValid && registryManifest?.schemaVersion === 2) {
    if (MANIFEST_MEDIA.has(registryManifest.mediaType)) {
      details.registryManifestValid = DIGEST_RE.test(registryManifest.config?.digest || '')
        && Array.isArray(registryManifest.layers);
      if (details.registryManifestValid) allowed.add(expectedRegistryDigest);
    } else if (INDEX_MEDIA.has(registryManifest.mediaType)
      && Array.isArray(registryManifest.manifests)
      && registryManifest.manifests.length > 0
      && registryManifest.manifests.length <= 64) {
      const children = registryManifest.manifests.filter((entry) =>
        entry.platform?.os === 'linux'
        && entry.platform?.architecture === 'amd64'
        && MANIFEST_MEDIA.has(entry.mediaType)
        && DIGEST_RE.test(entry.digest || ''));
      // Only one platform-specific executable manifest can be authoritative.
      details.platformChildPresent = children.length === 1;
      details.registryManifestValid = details.platformChildPresent;
      if (details.registryManifestValid) {
        allowed.add(expectedRegistryDigest);
        allowed.add(children[0].digest);
      }
    }
  }
  details.digestMatches = details.registryManifestValid
    && Boolean(sourceDigest)
    && allowed.has(sourceDigest);
  return {
    passed: details.revisionMatches && details.ready && details.digestMatches,
    details,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [registryPath, revisionPath, diagnosis] = process.argv.slice(2);
  try {
    if (!registryPath || !revisionPath) throw new Error('PROVENANCE_INPUTS_REQUIRED');
    const report = verifyCloudRunImageProvenance({
      registryManifest: JSON.parse(readFileSync(registryPath, 'utf8')),
      revision: JSON.parse(readFileSync(revisionPath, 'utf8')),
      expectedRevision: process.env.EXPECTED_FINANCE_REVISION,
      expectedRegistryDigest: process.env.EXPECTED_FINANCE_IMAGE_DIGEST,
    });
    if (report.passed) {
      if (diagnosis !== '--quiet') console.log('FINANCE_IMMUTABLE_IMAGE_PROVENANCE_OK');
      process.exit(0);
    }
    if (diagnosis === '--diagnose') {
      console.error('FINANCE_IMAGE_PROVENANCE_GUARD_FAILED ' + JSON.stringify(report.details));
    }
    process.exit(1);
  } catch {
    console.error('FINANCE_IMAGE_PROVENANCE_UNVERIFIABLE');
    process.exit(1);
  }
}
