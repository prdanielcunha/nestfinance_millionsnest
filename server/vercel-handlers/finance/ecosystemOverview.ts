import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

const MAX_ORGANIZATIONS = 100;
const MAX_SCANNED_ORGANIZATIONS = 500;
const ORG_BATCH_SIZE = 8;
const OPEN_TRANSACTION_STATUSES = ['draft', 'ready_for_review', 'approved_for_posting'] as const;

type OrganizationOverview = {
  id: string;
  name: string;
  slug: string;
  financeEntities: number;
  drafts: number;
  readyForReview: number;
  approvedForPosting: number;
  openTransactions: number;
  state: 'attention' | 'active' | 'clear' | 'unavailable';
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isInactive(value: any): boolean {
  return (
    value?.disabled === true ||
    ['archived', 'inactive', 'suspended', 'disabled', 'removed', 'revoked'].includes(
      clean(value?.status).toLowerCase(),
    )
  );
}

export function hasNestFinanceEntitlement(data: any): boolean {
  const enabledApps = Array.isArray(data?.enabledApps) ? data.enabledApps : [];
  const entitlement = data?.entitlements?.nestfinance;

  return (
    enabledApps.includes('nestfinance') &&
    (entitlement?.active === true || entitlement?.status === 'active')
  );
}

export function canUseEcosystemOverview(session: any): boolean {
  return session?.granted === true && session?.isGlobalAccess === true;
}

export function organizationOverviewState(input: {
  readyForReview: number;
  openTransactions: number;
}): OrganizationOverview['state'] {
  if (input.readyForReview > 0) return 'attention';
  if (input.openTransactions > 0) return 'active';
  return 'clear';
}

async function countStatus(transactions: any, status: (typeof OPEN_TRANSACTION_STATUSES)[number]) {
  const snapshot = await transactions.where('status', '==', status).count().get();
  const count = snapshot.data()?.count;
  return typeof count === 'number' ? count : 0;
}

async function summarizeOrganization(db: any, organization: { id: string; name: string; slug: string }) {
  const orgRef = db.collection('organizations').doc(organization.id);
  const [entitiesSnapshot, drafts, readyForReview, approvedForPosting] = await Promise.all([
    orgRef.collection('financeEntities').select('active').get(),
    countStatus(orgRef.collection('financeTransactions'), 'draft'),
    countStatus(orgRef.collection('financeTransactions'), 'ready_for_review'),
    countStatus(orgRef.collection('financeTransactions'), 'approved_for_posting'),
  ]);

  const financeEntities = entitiesSnapshot.docs.reduce(
    (total: number, document: any) => total + (document.data()?.active === false ? 0 : 1),
    0,
  );
  const openTransactions = drafts + readyForReview + approvedForPosting;

  return {
    ...organization,
    financeEntities,
    drafts,
    readyForReview,
    approvedForPosting,
    openTransactions,
    state: organizationOverviewState({ readyForReview, openTransactions }),
  } satisfies OrganizationOverview;
}

async function mapInBatches<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    results.push(...(await Promise.all(batch.map(mapper))));
  }
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = req.headers.authorization;
  if (
    !authorization ||
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(authorization.slice(7), true);
    const uid = clean(decoded?.uid);
    const activeOrganizationId = clean(decoded?.mn_organization_id);

    if (!uid || !activeOrganizationId) {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    // Global authority is resolved canonically for the currently scoped organization.
    // The client can never opt into ecosystem scope by sending a role or organization list.
    const activeSession = await resolveEcosystemSession(uid, activeOrganizationId);
    if (!canUseEcosystemOverview(activeSession)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Scan only organizations where NestFinance is explicitly enabled. The app
    // entitlement is then checked again before any finance metadata is read.
    // This remains bounded even if the ecosystem grows substantially.
    const snapshot = await admin.firestore
      .collection('organizations')
      .where('enabledApps', 'array-contains', 'nestfinance')
      .limit(MAX_SCANNED_ORGANIZATIONS)
      .get();

    const eligibleOrganizations = snapshot.docs
      .filter((document: any) => {
        const data = document.data() || {};
        return !isInactive(data) && hasNestFinanceEntitlement(data);
      })
      .map((document: any) => {
        const data = document.data() || {};
        return {
          id: document.id,
          name: clean(data.name) || clean(data.displayName) || document.id,
          slug: clean(data.slug),
        };
      });

    const truncated =
      eligibleOrganizations.length > MAX_ORGANIZATIONS ||
      snapshot.size >= MAX_SCANNED_ORGANIZATIONS;
    const visibleOrganizations = eligibleOrganizations.slice(0, MAX_ORGANIZATIONS);

    const organizations = await mapInBatches(
      visibleOrganizations,
      ORG_BATCH_SIZE,
      async (organization): Promise<OrganizationOverview> => {
        try {
          return await summarizeOrganization(admin.firestore, organization);
        } catch (error) {
          console.error('Ecosystem organization summary unavailable:', organization.id, error);
          return {
            ...organization,
            financeEntities: 0,
            drafts: 0,
            readyForReview: 0,
            approvedForPosting: 0,
            openTransactions: 0,
            state: 'unavailable',
          };
        }
      },
    );

    organizations.sort((a, b) => {
      if (a.state === 'unavailable' && b.state !== 'unavailable') return 1;
      if (a.state !== 'unavailable' && b.state === 'unavailable') return -1;
      if (a.readyForReview !== b.readyForReview) return b.readyForReview - a.readyForReview;
      if (a.openTransactions !== b.openTransactions) return b.openTransactions - a.openTransactions;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    const available = organizations.filter((organization) => organization.state !== 'unavailable');
    const totals = available.reduce(
      (summary, organization) => {
        summary.organizations += 1;
        summary.financeEntities += organization.financeEntities;
        summary.openTransactions += organization.openTransactions;
        summary.readyForReview += organization.readyForReview;
        if (organization.readyForReview > 0) summary.organizationsNeedingAttention += 1;
        return summary;
      },
      {
        organizations: 0,
        financeEntities: 0,
        openTransactions: 0,
        readyForReview: 0,
        organizationsNeedingAttention: 0,
      },
    );

    return res.status(200).json({
      activeOrganizationId,
      totals,
      organizations,
      unavailableOrganizations: organizations.filter(
        (organization) => organization.state === 'unavailable',
      ).length,
      truncated,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (
      error?.code === 'auth/id-token-expired' ||
      error?.code === 'auth/id-token-revoked' ||
      error?.code === 'auth/invalid-id-token' ||
      error?.code === 'auth/argument-error'
    ) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    console.error('Ecosystem overview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
