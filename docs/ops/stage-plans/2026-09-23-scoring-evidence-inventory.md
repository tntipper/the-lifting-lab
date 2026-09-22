# Scoring evidence inventory: offline work unit

## Outcome and boundary

Produce a review queue for every methodology group without changing a score,
formula, product recommendation or public claim. The output must distinguish
historical formula text, guide citations and missing product-level evidence.
The current recommendation hold remains in force.

## Starting state and scope

At `ca46590` on `codex/tll-integration`, `lib/methodology.ts` defines 15 groups;
`scripts/_build-scores.mjs` reads an unavailable Windows Path A `data.js` and
the site uses frozen `lib/scores.ts`. The source review notes are in
`docs/research/guide-citations-A.md`, `-B.md` and `-C.md`.
`docs/research/unassessed-ranking-containment.md` documents the current hold.

This unit may add only this plan, `docs/research/scoring-evidence-inventory.md`
and a handover entry. It uses repository files only. It does not verify new
scientific claims, add a product dataset, change scoring, contact a provider,
or alter a hosted environment. Preserve unrelated untracked files.

## Checks, stop and review

Before writing, confirm branch, HEAD and methodology keys. Cross-check each
inventory row against the actual methodology and historical guide-citation
files. Stop if an item cannot be mapped without guessing; mark it unknown.
Check that all 15 groups are listed and that the hold language is accurate.
The review point is a read-only independent check before commit. No execution
window or external action is authorized. Record the result in the handover.
