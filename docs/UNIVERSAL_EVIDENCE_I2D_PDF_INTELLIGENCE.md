# Universal Evidence I2D — Deterministic PDF Intelligence Foundation

## Purpose

I2D adds a server-side, deterministic inspection layer for finalized Universal Evidence PDFs. Its only purpose is to decide whether the verified original appears suitable for a future deterministic text path before any OCR or AI is considered.

This slice does not extract document text, classify documents, recognize financial fields, create drafts, post transactions, or mutate accounting state.

## Preconditions

The analysis is available only when all of the following are true:

- the caller resolves through the canonical Finance request context with `finance.view`;
- the evidence belongs to the canonical `organizationId` and requested `financeEntityId`;
- the evidence is version 2 and is `accepted` or `duplicate`;
- the verified MIME type is `application/pdf`;
- the immutable original has a verified size and SHA-256;
- the Storage object still matches the verified size, SHA-256 and MIME type;
- the stored bytes still carry the PDF magic header.

The private Storage path and content hash are never returned to the client.

## Result semantics

The inspector returns one of three `textLayerState` values:

- `detected`: a supported, non-image PDF content stream contains a PDF text object (`BT ... ET`) with a text-showing operator such as `Tj` or `TJ`.
- `not_detected`: supported non-image streams were analyzed completely within the I2D limits and no text-showing operator was detected.
- `unknown`: the inspector cannot make the deterministic statement safely. Examples include encryption, unsupported non-image stream filters, decompression limits, malformed structures, or the stream-count limit.

`not_detected` means only **not detected by this deterministic I2D parser**. It is not proof that the document has no text and must never be presented as such.

## Supported structure

I2D intentionally has a narrow parser surface:

- raw/unfiltered streams;
- a single `FlateDecode` (`Fl`) stream filter;
- image streams are identified and excluded from text-layer detection.

Unsupported non-image filters fail closed to `unknown`. Unsupported image compression by itself does not make the text-layer result unknown when all relevant non-image content streams were analyzed safely.

## Resource limits

The Universal Evidence intake limit remains 10 MiB per original file.

The I2D inspector additionally bounds work per request:

- maximum 256 PDF streams considered;
- maximum 16 KiB dictionary lookback per stream;
- maximum 2 MiB compressed bytes for a Flate stream;
- maximum 2 MiB inflated output per Flate stream.

A compressed stream that exceeds these limits is not expanded without bound; the analysis fails closed to `unknown`.

## Security and privacy

- authorization uses the existing canonical Hub/Finance request context;
- `organizationId` from the request body cannot retarget the tenant;
- `financeEntityId` remains the legal-book boundary;
- organizational `owner` is not treated as a global role;
- the handler revalidates the immutable original before inspection;
- no raw original bytes, extracted text, Storage path, SHA-256 or internal UID are returned;
- no new Firestore client read path is introduced.

## Cost and automation boundary

I2D is deterministic and local to the NestFinance server runtime:

- no OCR;
- no Gemini or other AI provider;
- no model call;
- no external document-classification service;
- `financialRecognition` remains `false`.

The analysis is advisory evidence metadata only. It cannot create or modify transactions, journals, aggregates, balances, PostingPlans, Count sessions or any other financial record.

## Non-goals

I2D does not provide:

- full PDF text extraction;
- OCR for scanned/image-only PDFs;
- document type classification;
- CNPJ/CPF, dates, amounts, Pix or boleto extraction;
- confidence scoring for financial fields;
- automatic transaction creation;
- posting or reconciliation.

Those capabilities require separate, independently certified slices following the deterministic-first cost ladder.
