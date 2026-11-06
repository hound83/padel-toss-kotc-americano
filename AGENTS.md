# Coding-agent instructions — Koriander Padel Toss

These are standing instructions for `hound83/padel-toss-kotc-americano`. The user's current request defines the scope and destination; this document defines the working method.

## Outcome ownership

- Treat a substantial implementation request as ownership of a **complete, useful milestone**, not just the first code change. Investigate, implement, test, inspect real user flows, repair discovered in-scope defects, and document the result before stopping. Keep explicitly small fixes small; do not invent unrelated work.
- Briefly identify the intended result, existing behavior, important non-goals, and observable checks. Derive reasonable tests when unspecified. Do not ask for another "GO" for routine work already necessary to finish the request.
- Do not expand into unrelated modes, architecture rewrites, or feature ideas; record these separately. Review-only requests remain read-only.
- Continue until the milestone is checked, a material user decision or permission is needed, or execution limits are reached. On interruption, leave an exact branch/commit/test checkpoint rather than calling a partial result finished.

## Repository orientation

- Inspect the current branch, user changes, recent remote commits/PRs if available, and `README.md`. Inspect only the relevant portion of `index.html`, `tests/`, and `sw.js` for the task. Do not trust older chat snapshots as current state.
- This is a static GitHub Pages app: `index.html` contains the HTML, CSS, JavaScript and actual assignment logic. There is no current `package.json` or server-side scheduler. Avoid introducing dependencies or a framework without a demonstrated need.
- The four distinct modes are **Toss**, **Split Toss** (Silver/Gold/Platinum groups), **Americano** (scoring/ranking), and **King of the Court** (start assignment only). Never conflate their rules.

## Product and data invariants

- Preserve existing scheduling rules, player participation, score/ranking behavior, local session recovery, JSON import/export, presentation mode, and Dutch/English operation unless an explicit change requires otherwise.
- For KOC, the app creates only the **starting courts**; subsequent movement is performed by players. Support 2–8 courts, absences, re-roll, the established organizer placement and lowest-court vacancy rules. Read `tests/koc.test.cjs` before changing these algorithms; do not replace product rules with generic "random" behavior.
- Player names and sessions remain local to the browser; no new server-side collection or tracking without explicit product authorization.
- When changing app assets or offline behavior, verify service-worker/cache updating, fresh installs, upgrades, and reload behavior. A visually correct online page can still be stale offline.

## Implementation and verification loop

1. Reproduce relevant current behavior; for a scheduling change, capture deterministic fixtures or statistical properties as appropriate.
2. Implement one cohesive result with tests for new/changed behavior. Test the **real function** from the app where practical, not a duplicated implementation in the test.
3. Run `node --test tests/koc.test.cjs` for KOC-affecting changes. Add appropriate regression tests for Toss, Split Toss or Americano when those modes are changed; the existing KOC suite alone does not cover them.
4. Exercise the affected flows in a real browser where available: setup, generate, edit/absence/re-roll, save/reload, copy/export, language, mobile screen, and relevant offline/PWA behavior. Verify keyboard/touch and error/empty states where changed.
5. Fix discovered in-scope regressions and rerun affected tests. Report actual passes, failures and checks that were unavailable.

## Git, autonomous publication and delivery

- For meaningful changes, use a feature branch and a reviewable PR. Keep `main` runnable and preserve unrelated work. Never force-push or overwrite prior user data or accepted history.
- **Standing owner authorization:** after an authorized implementation milestone passes all applicable release gates, **merge its PR and let the configured GitHub Pages publication complete without asking for another GO**. Do not treat a review/diagnosis-only request as implementation authorization.
- **Required gates:** the four-mode product contract and scoped acceptance tests are satisfied; changed algorithms have suitable regression coverage; the existing KOC test passes where applicable; changed user journeys were exercised in a real browser, including mobile/keyboard/touch as relevant; storage/session, privacy and offline/PWA update behavior remain correct; the exact PR revision passes relevant automated checks; no high-severity or unapproved changes remain. Verify the diff, live target, and recoverable prior commit. For scheduling-logic changes, if appropriate CI coverage is absent, establish it as part of the release-ready milestone before auto-merging.
- Respect required GitHub reviews, branch protection, permissions and deployment approval. If required evidence or access is missing, **do not merge**; leave a ready PR and the exact blocker. The current KOC test alone is insufficient proof for changes to other modes.
- After merging, verify GitHub Pages and a fresh-session browser load of the **live site**; if the change affects cached files, confirm an existing PWA/client can receive the update. If verification fails, repair safely or report the failed publication, never claim it is live.
- Avoid cosmetic micro-version bumps. Finish with the user-visible change, tests and manual checks, before/after evidence when applicable, PR/merge/live links and any limitations. Do not end by proposing obvious remaining steps within the assigned milestone.

