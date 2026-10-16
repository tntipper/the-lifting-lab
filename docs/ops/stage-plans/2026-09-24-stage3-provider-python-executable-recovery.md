# Stage 3 provider launcher Python executable recovery — disabled unit

## Outcome and acceptance

Remove a known local execution blocker before any provider-normalization arming. `scripts/staging-provider-normalization-live-launcher.mjs` currently invokes `/usr/bin/python3`, which exits 69 on this Mac because the Xcode license has not been accepted. The exact Codex bundled Python at `/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` runs successfully and, with the helper's approval gate still false, invokes the helper with exit 1 and no output. This unit changes only the launcher's Python executable path and its generated activation-manifest hash. It does not arm any gate or access Keychain/network.

Acceptance: the launcher still returns `PROVIDER_NORMALIZATION_LIVE_DISABLED` before imports, manifest reads, journals, Keychain and network; both Python executable and helper disabled probes have the observed fixed results; manifest checks, live-boundary, focused tests and diff check pass; an independent reviewer finds no changed effectful boundary. Stage 3 provider mutation remains HOLD.

## Starting state, exclusions and allowed edits

Local branch `codex/tll-integration` has published immutable staging source S `abd5a5258dd1072daf83a4447ce7110465f445e1` and newer local evidence commits. Remote remains S. The protected Preview at S is Ready and its disabled runtime was verified in a one-run receipt. Provider is historically enabled with a JWKS URI; its current official Admin response has not yet been freshly read. Existing provider-normalization journals are not to be opened in this unit.

Only `scripts/staging-provider-normalization-live-launcher.mjs`, `config/staging-account-activation-manifest.json`, this plan and the handover/evidence may change. Preserve unrelated untracked files. No Xcode license acceptance, provider update, credential read, deployment, production change, purchase or customer action.

## Execution and verification

1. Recheck path, branch, HEAD/status and the two Python probes. The bundled path is a symlink to `python3.12`; the local resolved executable SHA-256 was `ac60cfe0268614638d0ffa35f3b0284fc7b3a11482723793455e17eeb278509e`. Recheck this before a future armed window; a changed or unavailable runtime is HOLD, not grounds to fall back to system Python.
2. Change the one fixed executable string in the disabled launcher. Regenerate the activation manifest; inspect the exact diff. Do not change any false gate, selector, target, journal or network factory.
3. Run direct disabled launcher and helper probes, manifest `--check`, `npm run check:live-boundaries`, focused relevant tests and `git diff --check` while all gates are false. Obtain independent review of the exact diff and check results. Commit this disabled correction only after GO.
4. Before the **separate** provider normalization action, refresh official provider/database/secret/Preview baselines, verify the Python path/hash and credential availability, review the precise arming diff, obtain fresh owner approval, execute at most once with its own journals, reconcile separately and disarm. This unit does not authorize that action.

Failure or unexpected local output stops this unit. Do not create a journal or test the armed launcher to discover whether the interpreter works.
