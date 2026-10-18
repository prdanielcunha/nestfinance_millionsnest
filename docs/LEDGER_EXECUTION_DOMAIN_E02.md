# E02 execution domain foundation

This pure domain boundary validates balanced journal material for income, paid expense, asset transfer and liability settlement. It requires persisted, versioned and entity-scoped account/category/ledger references; preview fallback identifiers are not eligible. Current content, approver, approval/source hash, reference fingerprint, plan hash, period state and exact version are checked again before preparing journal lines and signed account movements.

The function has no persistence or HTTP exposure. No existing workflow calls it, no feature flag is enabled, and no real transaction is posted by this slice. Local tests cover four balanced cases, 33 rejection/integrity cases and deterministic reference ordering. CI also exercises existing posting-plan and journal regressions.

Integration still requires an atomic persistence adapter, independently authorized endpoints, safe initialization of existing histories, real configuration/mapping approval, reversal, period locks, verified opening balance and protected read models. Reimbursement and cost-center execution deliberately reject until their references can be validated. This is a necessary E02 foundation, not completion or production certification of E02.
