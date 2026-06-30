import fs from 'fs';
let content = fs.readFileSync('scripts/test-approval-verification-repair.ts', 'utf-8');
content = content.replace(/ledgerAccounts: \[\{ id: 'la_default_asset_mock-account' \}, \{ id: 'la_default_expense_cat-1' \}\]/g, "ledgerAccounts: [{ id: 'la_default_asset_mock-account', organizationId: orgId, financeEntityId: entId, active: true, postingAllowed: true }, { id: 'la_default_expense_cat-1', organizationId: orgId, financeEntityId: entId, active: true, postingAllowed: true }]");
fs.writeFileSync('scripts/test-approval-verification-repair.ts', content);
