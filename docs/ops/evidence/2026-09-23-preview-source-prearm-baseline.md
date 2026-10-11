# Stage 3 Preview source read — pre-arm baseline

Captured 2026-09-23, before credential access or arming. This is a read-only UI/Git baseline, not the authoritative Vercel API receipt.

- Local repo `implementation-integration`, branch `codex/tll-integration`, HEAD `f1dd570`. Only the previously noted unrelated untracked iCloud copies and `implementation-state/` were present before this evidence file.
- `git ls-remote --heads https://github.com/tntipper/the-lifting-lab.git refs/heads/codex/tll-integration` returned `0f8027288ac52667089a094b73a2c03ff63ca916`; the reviewed local source guard returned `SOURCE_NOT_AT_REMOTE`.
- Signed-in Vercel project Git settings showed connected `tntipper/the-lifting-lab`. The UI does not disclose the linked numeric repository ID, so the project API check remains required.
- Vercel Deployments showed latest Ready Preview for `codex/tll-integration` at deployment `4M6P7P6rbG9w2Q9kC6y65rRzWB3V`, source `536d36a515ad39449338748b5739b0dcdedf8256`, created 23 Sept 2026 10:03:43 CEST. Its detail page showed Preview environment and the fixed alias `the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app`. This is older than remote and local source.
- `scripts/staging-preview-source-live-launcher.mjs` and `scripts/staging-preview-source-keychain.py` remained false-gated. `../implementation-state/staging/tll-preview-source-read-v1.json` was absent. `npm run check:live-boundaries` passed.

Candidate arming diff is isolated in `/tmp/tll-preview-source-arming-review-20260923`: the two false-to-true gates and their activation-manifest SHA updates only. It is **not applied**. Before using it, independently review the exact diff, confirm fresh baseline and token scope/expiry, obtain new action-time owner approval, then follow the one-run/disarm/reconcile sequence in `docs/ops/stage-plans/2026-09-23-stage3-preview-source-hosted-read.md`. No push, deployment, purchase or production change is authorized by this baseline.
