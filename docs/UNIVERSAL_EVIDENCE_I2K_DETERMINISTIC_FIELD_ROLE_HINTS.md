# Universal Evidence I2K — Deterministic Field Role Hints Foundation

## Scope

I2K adds a conservative semantic layer on top of the certified I2I text-signal candidates. It does **not** create new extracted facts. It only attaches an optional `roleHint` when the native text itself contains a nearby, same-line, explicit label that is compatible with the candidate kind.

The foundation remains local and deterministic:

- no new API or gateway operation;
- no frontend behavior in this slice;
- no Firestore or browser persistence;
- no OCR;
- no AI / Gemini;
- no network lookup;
- no supplier/category/fund inference;
- no transaction, journal, balance, aggregate, Count, PostingPlan, approval, reconciliation, or posting mutation.

## Why this exists

The Product Experience Standard requires extracted fields to preserve their origin, evidence, inference source, confirmation state, and uncertainty. I2I already identifies values and patterns. I2K begins the next safe step: separate **what was detected** from **what that value may represent in the document**.

A valid date is not automatically a due date. A valid CNPJ is not automatically the issuer. A BRL amount is not automatically the document total. I2K therefore leaves semantic role unassigned unless the document provides a strict explicit label.

## Supported role hints

I2K intentionally starts with a small vocabulary:

- `issue_date` — explicit issue/emission label beside a date;
- `due_date` — explicit due/vencimento label beside a date;
- `total_amount` — explicit document-total label beside a money candidate;
- `issuer_tax_id` — explicit issuer/emitente label beside CPF/CNPJ;
- `recipient_tax_id` — explicit recipient/destinatário label beside CPF/CNPJ;
- `payment_code` — explicit barcode/digitable-line label beside a boleto-pattern candidate;
- `pix_key` — inherited from the I2I Pix candidate, which already requires an explicit Pix label.

PT, EN and ES labels are supported for the non-Pix roles. Generic labels such as `Data:` or `Valor:` remain unassigned. `Subtotal`, tax totals, labels on another line, distant labels, and incompatible candidate types also remain unassigned.

## Bounded matching

Role matching is deliberately strict:

- labels must be on the **same line** as the candidate;
- the label must end immediately before the candidate, allowing only bounded punctuation/spacing;
- only the last **96 characters** before the candidate are considered;
- role rules are candidate-kind-specific;
- candidates outside the certified I2I scanned boundary fail closed to `roleHint: null`.

## Review metadata contract

I2K wraps each original I2I signal without rewriting it and adds review metadata:

- `roleHint` or `null`;
- `roleEvidence: explicit_label` only when a hint exists;
- `matchedLabel` only when a hint exists;
- `semanticState: unconfirmed`;
- `requiresConfirmation: true`;
- `source: native_text`;
- `derivedBy: deterministic_rule`;
- `ocrUsed: false`;
- `aiUsed: false`;
- `userConfirmed: false`.

A role hint is assistive evidence for review, never permission to save, approve, classify, reconcile or post financial data.

## Next boundary

A later UI slice may surface these role hints beside the existing I2J review candidates. That UI must continue to call them suggestions/hints, make confirmation explicit, preserve the original raw/context evidence, and add no automatic financial write.
