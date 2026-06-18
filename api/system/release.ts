import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({
    app: 'nestfinance',
    releaseMarker: 'accounts-actions-r3-20260618',
    gitCommitSha: 
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 
      process.env.GITHUB_SHA?.slice(0, 12) ?? null,
    environment: process.env.VERCEL_ENV ?? null
  });
}
