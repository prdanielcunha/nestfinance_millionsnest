// Legacy test entrypoint kept for compatibility with older local commands.
// The previous file duplicated authorization logic and could report PASS without exercising
// the real resolver. Delegate to the canonical resolver test so there is one source of truth.
import './test-ecosystem-session-resolver.js';
