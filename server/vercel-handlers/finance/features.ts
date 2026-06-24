export function isRealPostingEnabled(): boolean {
  return process.env.NESTFINANCE_REAL_POSTING_ENABLED === 'true';
}
