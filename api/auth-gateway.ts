import type { VercelRequest, VercelResponse } from '@vercel/node';
import handoffRedeem from '../server/vercel-handlers/auth/handoffRedeem.js';
import sessionResolve from '../server/vercel-handlers/auth/sessionResolve.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let operation = req.query.operation;
  if (Array.isArray(operation)) {
    operation = operation[0];
  }

  // Remove used param before delegating
  if (req.query) {
    delete req.query.operation;
  }

  switch (operation) {
    case 'handoff-redeem':
      return handoffRedeem(req, res);
    case 'session-resolve':
      return sessionResolve(req, res);
    default:
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
  }
}
