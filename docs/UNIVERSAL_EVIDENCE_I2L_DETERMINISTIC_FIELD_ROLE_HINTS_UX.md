# Universal Evidence I2L — Deterministic Field Role Hints UX

## Scope

I2L surfaces the certified I2K semantic role hints inside the existing I2J deterministic text-signal panel. It does not create a new extraction path, new backend operation, or new persistence model.

The existing user sequence remains:

1. deterministic PDF readiness;
2. explicit protected native-text read through I2G/I2H;
3. explicit **Analyze signals** action;
4. I2I detects bounded text signals locally;
5. I2K enriches those same signal objects locally with optional semantic role hints;
6. I2L renders the signal evidence and semantic suggestion as separate concepts.

## UX boundary

A candidate's signal strength and its possible document role are intentionally different UI concepts.

Examples:

- a BRL amount may be `Validado por regra` as a money signal while its semantic role remains unassigned;
- `Valor total: R$ 742,91` may additionally receive the role hint `Valor total`, but that role still requires human confirmation;
- `Data: 24/08/2026` remains a valid date signal with no automatic issue/due-date role;
- an unlabeled CNPJ remains a validated tax identifier with no automatic issuer/recipient role.

For an assigned role, I2L shows:

- a localized **possible role** label;
- the localized suggested role;
- an explicit human-confirmation requirement;
- the exact explicit label that supported the suggestion.

For an unassigned role, I2L explicitly says that the semantic meaning was not determined automatically and instructs the reviewer not to assume it.

## Languages

PT / EN / ES role labels and safety copy cover:

- issue date;
- due date;
- total amount;
- issuer tax ID;
- recipient tax ID;
- payment code;
- Pix key.

## Privacy and cost

I2L adds no network request. Both I2I and I2K run synchronously in browser memory after the existing explicit user action over text that was already authorized and read through I2G/I2H.

I2L adds:

- zero API/gateway operations;
- zero Firestore reads/writes;
- zero browser persistence;
- zero OCR;
- zero AI/model calls;
- zero external lookup.

## Financial safety

I2L has no confirmation, save, apply, approve, reconcile, classify, posting, transaction, journal, balance, aggregate, PostingPlan, or Count mutation action.

`requiresConfirmation: true`, `semanticState: unconfirmed`, and `userConfirmed: false` remain foundation metadata from I2K. The UI communicates this boundary but does not persist a human decision. Durable confirmation belongs to a later Review Workspace boundary with its own authorization, audit, and write contract.

## Regression boundary

I2L preserves:

- one I2I parser execution per explicit analysis action;
- one I2K role-hint pass over that exact I2I result;
- the protected I2G native-text boundary;
- the existing I2J explicit-action/no-network/no-persistence guarantees;
- original raw/context evidence rendered as inert React text;
- deterministic limits inherited from I2I/I2K.
