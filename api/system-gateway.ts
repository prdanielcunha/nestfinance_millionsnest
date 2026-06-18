import type { VercelRequest, VercelResponse } from '@vercel/node';
import release from '../server/vercel-handlers/system/release.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let operation = req.query.operation;
  if (Array.isArray(operation)) {
    operation = operation[0];
  }

  if (req.query) {
    delete req.query.operation;
  }

  switch (operation) {
    case 'release':
      return release(req, res);
    default:
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
  }
}
