# Universal Evidence I2I — Deterministic Text Signals Foundation

## Scope

I2I begins Document Intelligence Layer 1 by analyzing already-available plain native text with deterministic parsers only. It produces bounded **candidates**, not accounting facts, approvals, classifications, or postings.

This slice is intentionally foundation-only:

- no new API operation;
- no frontend surface;
- no Firestore or browser persistence;
- no OCR;
- no AI / Gemini;
- no network lookup;
- no supplier/category inference;
- no transaction, journal, balance, aggregate, Count, PostingPlan, or posting mutation.

The certified I2G native PDF text endpoint and I2H opt-in UX remain unchanged.

## Deterministic signals

The parser currently recognizes only bounded explicit patterns:

- **CNPJ**: numeric formatted or compact candidates validated with the existing canonical `isValidCnpj` helper;
- **CPF**: numeric formatted or compact candidates validated by deterministic check digits local to the parser;
- **dates**: explicit `DD/MM/YYYY`, `DD.MM.YYYY`, and ISO `YYYY-MM-DD`, with real calendar validation and ISO normalization;
- **money**: amounts only when explicitly marked by `R$` or `BRL`, normalized to integer cents;
- **Pix key**: a compact key only when directly introduced by an explicit `Pix:` / `Chave Pix:` style label;
- **boleto/barcode**: digit-rich 44, 47, or 48 digit candidates after separator normalization. This is `pattern_only`; I2I does not claim checksum or banking validity.

Bare ambiguous numbers, unlabeled emails, impossible dates, and invalid CPF/CNPJ values are intentionally rejected.

## Evidence contract

Every returned candidate preserves:

- `kind`;
- `raw` matched evidence;
- deterministic `normalized` value;
- source `start` / `end` offsets;
- bounded local `context`;
- evidence strength: `validated`, `explicit_label`, or `pattern_only`;
- type-specific metadata such as integer `amountCents` or boleto digit length when applicable.

There is no numeric "AI confidence" because no model is involved.

## Resource limits

I2I inherits the I2F native-text response ceiling and adds a result fan-out ceiling:

- at most **100,000 input characters** are scanned;
- at most **100 candidates** are returned;
- clipping/candidate-cap conditions set `limited=true` explicitly;
- candidate order is stable by source position;
- repeated execution over the same input is deterministic.

## Security and privacy

`documentIntelligenceTextSignals.ts` is a pure shared parser. It does not import Firebase Admin, Firestore, browser storage, AI SDKs, or network clients. It receives a string and returns a deterministic in-memory result.

No text or candidate is persisted by this slice. I2I therefore cannot approve, post, create, mutate, or reconcile financial data.

## Next boundary

A future slice may expose these candidates in the review experience or add additional deterministic validators/lookups. That integration must independently preserve tenant/entity/evidence authorization and must not silently turn candidates into financial facts. OCR and AI remain later escalation layers only when deterministic text/rules are insufficient.
