export type NestFinanceGateway = 'auth' | 'finance' | 'system';

export interface NestFinanceCloudRunRoute {
  gateway: NestFinanceGateway;
  operation: string;
}

// Canonical Cloud Run compatibility table generated from the public Vercel rewrite contract.
// Keep this in exact parity with vercel.json until the Vercel rollback path is retired.
export const NESTFINANCE_CLOUD_RUN_ROUTES = {
  "/api/auth/handoff/redeem": {
    "gateway": "auth",
    "operation": "handoff-redeem"
  },
  "/api/auth/session/resolve": {
    "gateway": "auth",
    "operation": "session-resolve"
  },
  "/api/finance/setup/initialize": {
    "gateway": "finance",
    "operation": "setup-initialize"
  },
  "/api/finance/accounts/list": {
    "gateway": "finance",
    "operation": "accounts-list"
  },
  "/api/finance/accounts/create": {
    "gateway": "finance",
    "operation": "accounts-create"
  },
  "/api/finance/accounts/archive": {
    "gateway": "finance",
    "operation": "accounts-archive"
  },
  "/api/finance/accounts/reactivate": {
    "gateway": "finance",
    "operation": "accounts-reactivate"
  },
  "/api/finance/funds/list": {
    "gateway": "finance",
    "operation": "funds-list"
  },
  "/api/finance/funds/create": {
    "gateway": "finance",
    "operation": "funds-create"
  },
  "/api/finance/funds/archive": {
    "gateway": "finance",
    "operation": "funds-archive"
  },
  "/api/finance/funds/reactivate": {
    "gateway": "finance",
    "operation": "funds-reactivate"
  },
  "/api/finance/categories/list": {
    "gateway": "finance",
    "operation": "categories-list"
  },
  "/api/finance/categories/create": {
    "gateway": "finance",
    "operation": "categories-create"
  },
  "/api/finance/categories/archive": {
    "gateway": "finance",
    "operation": "categories-archive"
  },
  "/api/finance/categories/reactivate": {
    "gateway": "finance",
    "operation": "categories-reactivate"
  },
  "/api/finance/categories/update": {
    "gateway": "finance",
    "operation": "categories-update"
  },
  "/api/finance/accounts/update": {
    "gateway": "finance",
    "operation": "accounts-update"
  },
  "/api/finance/entities/cnpj-lookup": {
    "gateway": "finance",
    "operation": "entities-cnpj-lookup"
  },
  "/api/finance/entities/create": {
    "gateway": "finance",
    "operation": "entities-create"
  },
  "/api/finance/entities/list": {
    "gateway": "finance",
    "operation": "entities-list"
  },
  "/api/finance/entities/detail": {
    "gateway": "finance",
    "operation": "entities-detail"
  },
  "/api/finance/entities/update": {
    "gateway": "finance",
    "operation": "entities-update"
  },
  "/api/finance/entities/bootstrap/status": {
    "gateway": "finance",
    "operation": "entities-bootstrap-status"
  },
  "/api/finance/entities/bootstrap/preview": {
    "gateway": "finance",
    "operation": "entities-bootstrap-preview"
  },
  "/api/finance/entities/bootstrap/apply": {
    "gateway": "finance",
    "operation": "entities-bootstrap-apply"
  },
  "/api/finance/entities/bootstrap/verify": {
    "gateway": "finance",
    "operation": "entities-bootstrap-verify"
  },
  "/api/system/release": {
    "gateway": "system",
    "operation": "release"
  }
} as const;
