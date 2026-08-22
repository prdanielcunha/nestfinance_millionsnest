# Universal Evidence I2G — Protected Native PDF Text API

## Purpose

I2G exposes the certified I2F native PDF text extractor through the canonical finance gateway for explicit, server-authorized use. It remains read-only and does not add frontend UX in this slice.

## Canonical operation

- gateway: `/api/finance-gateway`;
- operation: `universal-evidence-pdf-text`;
- method: `POST`;
- required capability: `finance.view`;
- request body: `financeEntityId` and `evidenceId` only.

The organization is resolved from the authenticated canonical finance request context. A body-provided organization identifier has no authority.

## Evidence boundaries

The endpoint only reads Universal Evidence nested under the authenticated organization and requested finance entity. It requires:

- evidence version 2;
- processing state `accepted` or `duplicate`;
- verified MIME `application/pdf`;
- immutable original;
- verified byte size and SHA-256;
- Storage byte size/hash/content type revalidation;
- PDF signature verification.

Metadata above the I2F 4 MiB extraction cap is rejected before any Storage read.

## Response privacy

Responses set `Cache-Control: private, no-store`. Storage paths and content hashes are never returned.

## Explicit non-scope

I2G does not:

- persist extracted text;
- write Universal Evidence;
- use OCR;
- use Gemini or any AI model;
- perform financial recognition or classification;
- recognize values, CNPJ/CPF, Pix, boleto or bank data;
- create/update transactions, journals, aggregates, balances, PostingPlans or Count data;
- perform real posting.

The endpoint reports `deterministic: true`, `aiUsed: false`, `ocrUsed: false` and `financialRecognition: false` alongside the bounded I2F extraction result.
