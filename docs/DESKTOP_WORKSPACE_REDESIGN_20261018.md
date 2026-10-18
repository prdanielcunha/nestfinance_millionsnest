# Desktop workspace correction — 2026-10-18

The user's supplied authenticated screenshot of `/finance` showed an oversized single-column panel, tiny navigation brand, crowded sidebar and a footer consuming much of the navigation height. The global operational paragraph font rule also overrode deliberate financial-value sizes.

This slice changes presentation only: a desktop header with current route/search/theme, a readable viewport of the existing compact logo, scrollable navigation with a collapsed native account/preferences section, and a two-column Today composition separating balance/daily movements from next action. Agenda and review queue remain distinct. Below 1024px the overview stacks; below 768px existing mobile navigation and 16px operational controls remain. Detailed professional content is preserved.

All displayed amounts come from the existing operational snapshot. Unknown balance remains unknown, real verified zero remains zero, daily movements disclose possible drafts, and source failures/loading cannot falsely claim there are no pending items. The Retry action uses the existing state-aware data loaders. No server/API, Auth, RBAC, Firestore Rules, financial records or storage migration changes.

Validation: actual React component SSR checks cover monetary formatting, unknown/zero, error/loading, conditional actions, input escaping, input immutability and PT/EN/ES; existing theme/contrast, experience, navigation, brand, TypeScript/build and exact-head CI checks remain required. Independent OpenAI Reviewer approved engineering subject to those gates and production smoke.

Visual limitation: a separate owner-private review fixture rendered actual ShellLayout/TodayLedgerOverview components with explicitly synthetic data. It has no access to NestFinance authentication or database and is outside the app's build. Its deployment is not browser visual evidence. Cloud Browser required separate ChatGPT authentication, which automatic approval review rejected because that account login was not explicitly authorized. No authentication workaround, bypass token or audience change was used. Actual browser/device appearance, responsive overflow, logo cropping and keyboard interaction remain unverified and must not be described as visually certified.

Rollback: previous production commit `4dd76a32f96e748013fde32c4b5e9cf543e47184`; no financial data rollback is involved.
