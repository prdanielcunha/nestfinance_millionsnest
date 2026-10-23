# Approved lowercase nf — option 02

The 2026-10-22 user-approved lowercase continuous nf replaces the previous Nest Flow Signature runtime artwork. Its thin/thick outline and wordmark are traced from the approved blue image, not recreated with a font or generated again. `scripts/brand/nf-blue-master.json` records the source SHA-256 and immutable outlines.

Runtime assets live in `public/brand/nestfinance/nf-continuous/v2`. All UI logos and symbols are transparent SVG outlines, with no background rectangle, embedded raster, external font or remote dependency. Light surfaces use ink lettering; dark surfaces use ivory lettering and a lighter blue gradient for contrast. PWA icons deliberately have an opaque dark canvas and a safe zone for operating-system cropping. Social sharing cards have their own intentional dark canvas.

`NestFinanceLogo` supplies desktop/mobile navigation, native login and loading/access screens. The old navigation crop has been removed because v2 files already have compact viewports. The central MillionsNest app catalog uses the same approved symbol; public product previews and the hero also consume it. Existing access, organization, billing, translations and financial logic are unchanged.

To regenerate assets, install `sharp` in an external tooling directory and run `NF_SHARP_MODULE=/absolute/path/to/sharp node scripts/generate-approved-nf-brand.mjs`. This is optional build tooling; application installs and builds do not require it. Legacy public PNG aliases are regenerated with alpha transparency. Historical v1 documentation/artwork remains archived.

Validate with `npm run check:brand-assets`, `npm run lint` and `npm run build`. The Hub includes `node --import tsx scripts/test_nestfinance_approved_brand.ts`. The old Connect catalog suite contains unrelated stale assumptions about Connect launch status; those assumptions are outside this visual change.
