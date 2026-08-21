# Universal Evidence I2E — PDF Text Readiness UX

## Purpose

I2E exposes the already certified I2D deterministic PDF text-layer signal inside the Universal Evidence detail experience. It does not add a new parser or backend operation. Its purpose is to help a finance user understand whether a verified PDF appears to contain digital text before any future extraction, OCR or AI layer is considered.

## User interaction

- the readiness analysis is opt-in;
- opening the evidence detail does not trigger PDF inspection;
- the user explicitly selects the readiness action;
- the result is discarded when organization, finance entity or evidence context changes;
- only version 2, accepted/duplicate, fully verified PDFs render the readiness card.

## Result semantics

The UI preserves the I2D meanings exactly:

- `detected`: deterministic I2D inspection found a supported PDF text object with a text-showing operator;
- `not_detected`: I2D did not detect text in the supported deterministic subset; this is not proof that the PDF contains no text;
- `unknown`: I2D cannot make a safe determination for the document structure.

The UI must never translate `not_detected` into “the PDF has no text”.

## Security and isolation

The client calls only the existing `universal-evidence-pdf-inspect` operation through `/api/finance-gateway`.

The backend therefore retains the already certified I2D controls:

- `finance.view` authorization;
- canonical authenticated organization context;
- `financeEntityId` legal-book boundary;
- organizational `owner` is not a global role;
- verified immutable original checks;
- size, SHA-256, Storage MIME and PDF signature revalidation;
- no Storage path, SHA-256, raw bytes or extracted text returned.

I2E adds no direct Firestore client read and no persistence path.

## Automation and cost boundary

I2E performs no automatic document processing on page load. The only server work occurs after the user explicitly requests the already existing I2D deterministic inspection.

This slice adds:

- no OCR;
- no Gemini or other AI provider;
- no model call;
- no text extraction;
- no document classification;
- no financial field recognition;
- no dependency;
- no new API endpoint.

## Financial boundary

The readiness state is informational only. It cannot create or modify:

- transactions;
- journals;
- aggregates;
- balances;
- PostingPlans;
- Count sessions;
- Universal Evidence records;
- any posting or reconciliation state.

PT, EN and ES copy explicitly preserves this boundary.

## Future work

Native text extraction remains a separate future slice. A PDF.js-based extraction path was investigated, but it must not be promoted until its dependency and lockfile are reproducible under the canonical `npm ci` release gate and resource limits are independently certified.
