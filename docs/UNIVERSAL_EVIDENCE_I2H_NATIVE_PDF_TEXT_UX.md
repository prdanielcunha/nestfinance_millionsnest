# Universal Evidence I2H — Native PDF Text UX

## Scope

I2H exposes the already-certified I2G native PDF text operation inside Universal Evidence detail. It is a frontend-only, explicit user action.

The existing I2E readiness step remains visible first. Native text reading is offered only when the deterministic readiness response indicates:

- `textLayerState === detected`;
- `encrypted === false`;
- `unsupportedStreams === 0`;
- `limited === false`.

The backend remains authoritative and revalidates all I2G security boundaries independently.

## UX contract

- no extraction on page load;
- no extraction from `useEffect`;
- explicit click is required;
- stale responses are discarded when organization, finance entity, or evidence changes;
- extracted text is rendered as inert React text, never HTML;
- extracted and unavailable states are explicit;
- truncation is explicit;
- page and character counts are shown;
- PT / EN / ES copy is provided;
- extracted text is held only in component memory and reset on context/evidence change.

## Security and privacy

I2H does not add or change backend authorization. It reuses I2G:

- `finance.view`;
- token-bound canonical organization;
- nested `financeEntityId` / `evidenceId` isolation;
- finalized verified v2 PDF only;
- 4 MiB input cap before Storage read;
- byte/hash/MIME/signature revalidation;
- `private, no-store` response;
- 40-page and 100,000-character extractor limits.

The client does not persist extracted text in local storage, session storage, IndexedDB, Firestore, or any finance record.

## Explicit non-goals

I2H performs none of the following:

- OCR;
- Gemini or other AI;
- financial recognition or classification;
- automatic approval;
- transaction creation or mutation;
- journal, aggregate, balance, PostingPlan, Count, or posting writes;
- background extraction;
- text persistence.

## Cost behavior

The native read remains opt-in. I2H does not introduce an automatic document-processing loop. The deterministic readiness step precedes the native read in the UI, and no OCR/AI escalation exists in this slice.
