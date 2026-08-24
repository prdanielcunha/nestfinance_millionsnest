# Universal Evidence I2J — Deterministic Text Signals UX

## Scope

I2J exposes the certified I2I deterministic text-signal parser in Universal Evidence detail after the existing protected I2H native-text read.

The sequence is intentionally explicit:

1. the user runs deterministic PDF readiness;
2. when eligible, the user explicitly reads native PDF text through certified I2G/I2H;
3. only after native text is present on screen, the user may explicitly choose **Analyze signals**;
4. I2J runs I2I locally and synchronously over that already-read in-memory string.

No new backend operation is introduced.

## Privacy and authorization boundary

I2J does not bypass or replace I2G authorization. The signal panel only exists after I2G has already returned protected native text under its certified controls:

- `finance.view`;
- canonical token-bound organization;
- nested finance entity and evidence isolation;
- finalized verified v2 PDF;
- immutable original, byte/hash/MIME/signature revalidation;
- bounded native text extraction;
- `private, no-store` server response.

Once the authorized text is already in the I2H component memory, I2J performs a pure local parse. It does not send the text to another endpoint.

## UX contract

- signal analysis requires a second explicit user click;
- no analysis runs from component lifecycle effects;
- changing organization/entity/evidence or re-reading native text removes the prior extraction and therefore the signal panel/state;
- candidate excerpts and context render as inert React text, never HTML;
- PT / EN / ES copy is provided;
- empty results explicitly do not imply absence of relevant information;
- every result is described as a **review candidate**, never confirmed financial data;
- evidence strength is visible as `rule validated`, `explicit label`, or `pattern only`;
- parser limitations of 100,000 scanned characters and 100 returned candidates are explicit when reached.

## Cost behavior

I2J adds no server call, OCR request, AI request, model token usage, database read/write, or external lookup. The deterministic parser runs only in the browser after explicit user action.

## Financial safety

I2J does not:

- create or edit transactions;
- create journal entries;
- update balances or aggregates;
- create or apply PostingPlans;
- mutate Count;
- approve, return, reconcile, or post anything;
- persist candidates as accounting facts;
- infer a supplier/category automatically;
- use candidate detection as permission to perform any financial action.

Detected signals remain assistive evidence for future review work only.

## Backend non-regression

I2J adds no finance gateway operation and does not modify `universalEvidencePdfText.ts` or the I2G client service method. The existing protected native-text boundary remains the only network path involved in this flow.
