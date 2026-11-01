import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const IMAGE_MANIFEST_TYPES = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);

/**
 * Cloud Run can resolve the linux/amd64 child manifest of an OCI index,
 * whereas Artifact Registry returns the digest of the parent OCI index.
 * Never accept an unrelated digest or an arbitrary child: verify that the
 * exact linux/amd64 child belongs to the digest-pinned registry manifest.
 */
export function verifyCloudRunReleaseImage({ revision, manifest, revisionName, imageRef, artifactDigest }) {
  if (!revision || typeof revision !== 'object' ||
      !manifest || typeof manifest !== 'object') return { ok: false, reason: 'INVALID_INPUT' };
  if (!SHA256.test(artifactDigest || '') ||
      typeof imageRef !== 'string' ||
      !imageRef.endsWith('@' + artifactDigest) ||
      !/^[a-z0-9.-]+\/[a-zA-Z0-9_./-]+@sha256:[a-f0-9]{64}$/.test(imageRef)) {
    return { ok: false, reason: 'UNPINNED_IMAGE' };
  }
  if (!revisionName || revision.metadata?.name !== revisionName) {
    return { ok: false, reason: 'REVISION_MISMATCH' };
  }
  const containers = revision.spec?.containers;
  if (!Array.isArray(containers) || containers.length !== 1 || containers[0]?.image !== imageRef) {
    return { ok: false, reason: 'IMAGE_REFERENCE_MISMATCH' };
  }
  if (!revision.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True')) {
    return { ok: false, reason: 'REVISION_NOT_READY' };
  }

  const fullDigest = revision.status?.imageDigest;
  if (typeof fullDigest !== 'string') return { ok: false, reason: 'MISSING_RESOLVED_DIGEST' };
  const digestMatch = fullDigest.match(/(?:^|@)(sha256:[a-f0-9]{64})$/);
  if (!digestMatch) return { ok: false, reason: 'INVALID_RESOLVED_DIGEST' };
  const resolvedDigest = digestMatch[1];

  const isIndex = manifest.mediaType === 'application/vnd.oci.image.index.v1+json' ||
    manifest.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json';
  if (isIndex) {
    if (!Array.isArray(manifest.manifests)) return { ok: false, reason: 'INVALID_INDEX' };
    const platformMatches = manifest.manifests.filter((item) =>
      item?.platform?.os === 'linux' && item?.platform?.architecture === 'amd64' &&
      (!item.platform.variant || item.platform.variant === ''));
    if (platformMatches.length !== 1 ||
        !SHA256.test(platformMatches[0].digest || '') ||
        !IMAGE_MANIFEST_TYPES.has(platformMatches[0].mediaType)) {
      return { ok: false, reason: 'AMBIGUOUS_LINUX_AMD64_MANIFEST' };
    }
    if (resolvedDigest !== artifactDigest && resolvedDigest !== platformMatches[0].digest) {
      return { ok: false, reason: 'RESOLVED_DIGEST_NOT_IN_INDEX' };
    }
    return { ok: true, reason: 'EXACT_INDEX_OR_CHILD_VERIFIED' };
  }

  if (!IMAGE_MANIFEST_TYPES.has(manifest.mediaType) ||
      typeof manifest.config?.digest !== 'string' ||
      !SHA256.test(manifest.config.digest) ||
      !Array.isArray(manifest.layers)) {
    return { ok: false, reason: 'INVALID_SINGLE_PLATFORM_MANIFEST' };
  }
  if (resolvedDigest !== artifactDigest) return { ok: false, reason: 'SINGLE_MANIFEST_DIGEST_MISMATCH' };
  return { ok: true, reason: 'EXACT_IMAGE_MANIFEST_VERIFIED' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('MANIFEST_AND_REVISION_FILES_REQUIRED');
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const revision = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const result = verifyCloudRunReleaseImage({
      manifest,
      revision,
      imageRef: process.env.EXPECTED_FINANCE_IMAGE_REF,
      artifactDigest: process.env.EXPECTED_FINANCE_IMAGE_DIGEST,
      revisionName: process.env.EXPECTED_FINANCE_REVISION,
    });
    if (!result.ok) {
      console.error('FINANCE_REVISION_GUARD_FAILED ' + result.reason);
      process.exitCode = 1;
    } else {
      console.log('FINANCE_REVISION_IMAGE_VERIFIED ' + result.reason);
    }
  } catch {
    console.error('FINANCE_REVISION_GUARD_FAILED INPUT_READ_ERROR');
    process.exitCode = 1;
  }
}
