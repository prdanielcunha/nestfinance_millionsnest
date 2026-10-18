# Cash count and independently received income

New UI-created Count sessions declare `collectionScope: cash_only`. The two independent counters verify only physical tithes, offerings and other cash. Digital receipts do not block sealing the cash count. Manual save, independent verification, recount, corrections, capture application and proposal generation enforce the stored scope server-side. Mixed paper/OCR evidence is rejected for human review, never silently stripped.

Missing scope remains the historical mixed contract. Existing sessions, print forms and evidence are not migrated or rewritten. Older clients omitting the new field retain that contract; new clients always request cash-only explicitly.

Leadership/treasury records Pix or settled card income through the existing authorized Income entry flow, with actual receipt date even when registration happens later. Category describes tithes/offerings; payment method describes cash/Pix/card. Recorded time and receipt date remain distinct. Receipt reports aggregate canonical transactions once, never raw counts plus derived transactions. Draft and posted totals remain distinct. A late digital entry never changes cash evidence or reopens its count.

For cards, donation date, settlement date, gross contribution, fees and net cash are distinct concepts. This change adds guidance for already received income; it does not implement card receivables, automatic matching, fee allocation, accrual journal posting or statutory accounting certification. Those workflows require their own evidence and reviewed implementation. Existing competence-date support remains available. No posting feature, shared Rules, IAM, billing or production records are changed by this release.

Reference: Planning Center documents cash/check batches and independently processed digital payment methods: https://help.planningcenter.com/en/138394-payment-methods.html and externally received payment sources: https://pcogiving.zendesk.com/hc/en-us/articles/115012277207-Payment-Sources . This supports the operational separation; it is not a claim of Brazilian accounting compliance.

Appearance: preserve the ivory/petrol/gold light identity and introduce deep petrol surfaces with mint accents and accessible text in dark mode. Theme is local and persistent, available before login and in desktop/mobile headers, applied before initial paint. PT/EN/ES labels and financial data remain unchanged. Rollback is the prior production release `07a3a6fb9a4d499de5df627287fff6b7abb37cf7`; no data rollback is necessary because there is no migration.
