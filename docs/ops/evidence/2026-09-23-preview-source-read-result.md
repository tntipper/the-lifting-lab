# Stage 3 Preview source read — one-run result

Executed once on 2026-09-23 under owner approval and the independently reviewed three-file arming candidate. This was a read-only Vercel project/alias/deployment observation; no push, deployment, provider/Shopify change, customer communication or purchase occurred.

## Result

- The fixed project read and source assessment completed with `OBSERVED` for Vercel project `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`. The project-link and deployment repository IDs passed the exact expected GitHub ID `1264363509`; the project mismatch check occurs before alias/deployment reads.
- The fixed Preview alias resolved to deployment `dpl_4M6P7P6rbG9w2Q9kC6y65rRzWB3V`, immutable URL `https://the-lifting-b4r3wwgp8-my-lifting-lab-s-projects.vercel.app`, source commit `536d36a515ad39449338748b5739b0dcdedf8256` and **no** `tllManifestSha256` metadata. The receipt status was `CURRENT_SOURCE_UNPROVEN`. This is an observation, not source-byte proof or launch readiness.
- Independent Vercel UI postflight showed that deployment still Ready/Latest for branch `codex/tll-integration`, Preview environment and the fixed branch alias. The remote branch remained `0f8027288ac52667089a094b73a2c03ff63ca916`, with local work further ahead. No branch push occurred.
- The distinct `../implementation-state/staging/tll-preview-source-read-v1.json` journal is consumed, mode `0600`, phase `SOURCE_READ`, outcome `OBSERVED`, sequence `3`, SHA-256 `8cfa92604014273f8028c1598a260a4abf94bcc91424c677bc39343e1e34fec9`. Never delete, modify or replay it.
- Both local gates were disarmed immediately, and the activation manifest regenerated. The three armed files are byte-identical to the pre-arm `45fd105` tree. Both manifest checks and `check:live-boundaries` passed. The temporary `/usr/bin/security` Keychain allowance was removed; the item again shows “Confirm before allowing access” with no allowed apps. The browser clipboard was cleared. The one-hour Vercel token remains in the fixed Keychain item and will expire naturally, per owner preference.

## Next gate

The direct blocker is source lag plus absent manifest metadata. Do not rerun this observer. Plan a distinct, disabled and independently reviewed exact-source Preview deployment path with remote commit/committed-manifest proof, Vercel Git source variant, Preview branch environment, one maximum POST, authoritative deployment readback and runtime checks. A metadata echo alone cannot prove deployed bytes. Provider normalization and account sign-in remain held until a current immutable Preview with all required evidence exists.
