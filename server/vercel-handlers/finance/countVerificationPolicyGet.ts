import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { assertCountV3Enabled, countV3PolicyFromEntity, sendCountV3Error } from './countVerificationV3Common.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const { context } = await resolveFinanceRequestContext(req, 'finance.manage');
    const revision = Number(context.financeEntity.countVerificationPolicyRevision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('COUNT_INVALID_POLICY_REVISION');
    }
    return res.status(200).json({
      financeEntityId,
      policy: countV3PolicyFromEntity(context.financeEntity),
      revision,
    });
  } catch (error: any) { sendCountV3Error(res, error); }
}
