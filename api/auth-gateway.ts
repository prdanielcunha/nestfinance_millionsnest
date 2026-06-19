import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = Array.isArray(req.headers['x-vercel-id']) ? req.headers['x-vercel-id'][0] : (req.headers['x-vercel-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  
  let operation = req.query.operation;
  if (Array.isArray(operation)) {
    operation = operation[0];
  }

  // Remove used param before delegating
  if (req.query) {
    delete req.query.operation;
  }

  try {
    switch (operation) {
      case 'handoff-redeem': {
        const module = await import('../server/vercel-handlers/auth/handoffRedeem.js');
        return await module.default(req, res);
      }
      case 'session-resolve': {
        const module = await import('../server/vercel-handlers/auth/sessionResolve.js');
        return await module.default(req, res);
      }
      default:
        return res.status(404).json({ error: 'ROUTE_NOT_FOUND', requestId });
    }
  } catch (error: any) {
    console.error('[auth-gateway]', {
      requestId,
      operation: operation || 'unknown',
      stage: 'handler_import_or_execution',
      errorName: error?.name,
      errorCode: error?.code || 'UNKNOWN',
      errorMessage: error?.message || 'Unknown error',
    });
    return res.status(500).json({
      error: 'INTERNAL_AUTH_ERROR',
      requestId,
    });
  }
}
