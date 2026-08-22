# Security Policy

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, tokens, personal data, financial documents, tenant identifiers, or production details in a public Issue or Pull Request.

Use GitHub private vulnerability reporting / Security Advisories when available. If that channel is unavailable, contact the repository maintainer privately before sharing sensitive technical details.

Include enough information to reproduce and assess the issue, but do not include real customer data or production secrets.

## Secrets and production data

This repository must never contain:

- API keys or access tokens;
- private keys or service-account credentials;
- real `.env` files;
- production database exports;
- real financial documents or receipts;
- personal data;
- operational customer/tenant IDs in one-off diagnostic scripts;
- production logs containing sensitive payloads.

Use synthetic fixtures for tests.

If a secret is ever committed, removing it from the latest revision is not sufficient. Revoke/rotate the credential immediately and assess whether Git history must be rewritten.

## Security architecture

NestFinance is multi-tenant. Authorization must remain server-side and bound to the canonical authenticated organization and finance entity. Never introduce bypasses based on hardcoded email, UID, organization name, or frontend-only state.

`production` is a separate promotion boundary and must not be changed as a side effect of repository maintenance or public-CI work.

## Public repository note

Repository visibility does not imply access to production infrastructure. Firebase Admin credentials, Vercel secrets, provider keys and other runtime credentials remain outside Git.
