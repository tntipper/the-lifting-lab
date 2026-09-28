# Stage 3 disposable Keychain fixture: disabled preparation

This records the local, disabled work unit for the first step of the Stage 3 recovery path. It is not evidence that macOS Keychain behavior has been qualified. No fixture keychain was created, no real Keychain item was read, and no provider, deployment, customer, or production state was changed.

## Scope and identities

- Branch at preparation: `codex/tll-integration`, starting from `960cb77ab2cb1be66b61b120f22aa00af49e5222`.
- Production native reader source SHA-256: `c1a4fcdbd63c4892a36f6da7f6b26231d666fa806eaf616d8b48873a23b276a7`. Its rebuilt **disabled** arm64, ad-hoc-signed private binary SHA-256: `169065b2697a4b29680ae458e341ec93135f5cc825dfd71f0eb8a64ce08e87b1`.
- Fixture-only native source SHA-256: `a1ab8034afd8b26d44d6c5274e987212840ddd897caf7de378fdd64ac4f74614`. Its **disabled** arm64, ad-hoc-signed private binary SHA-256: `94ff3955517f1087c9666ba440989b797661ae3ca746461d2c0c91b9419b9dcf`.
- The fixed private build location is `../implementation-state/staging/`. The former production disabled binary and receipt were preserved there with `.retired-<hash>` suffixes before rebuilding. Neither was overwritten or invoked.
- Both Swift live gates are false. The fixture launcher gate is false. The activation manifest pins the changed sources, and the live-boundary checker enforces those gates.

The fixture pins a separate owner-only file-based keychain under `~/Library/Caches/tll-stage3-keychain-fixture/` and synthetic selectors. The fixed local driver has a one-use parent journal; the native process has an operation-by-operation durable journal. It checks the parent/native identities and deadlines, blocks interaction, compares synthetic bytes inside the process, and refuses cleanup if the file or directory identity changes. Normal tests use an injected test main that cannot make Security.framework calls.

## Verification and review

- Independent Astra review: GO for **disabled preparation source** after correcting ACL authorization typing, path identity checks, native journal state ordering, and deadline checks. HOLD for any live fixture execution pending a separate armed-build design, exact checkout/artifact identity, final execution review and action-time owner approval.
- `npm test`: 2,464 passed, 2 skipped, 0 failed. The injected native test main ran only journal/identity/ACL-selection tests; it did not create or read a keychain.
- `npm run typecheck`, targeted ESLint, activation-manifest `--check`, live-boundary checker, both private disabled-build `--check` commands, and `git diff --check`: PASS.
- The production and fixture build commands only compiled and checked source-bound disabled binaries. No compiled live main was run.

## Remaining gate

The current fixture build/check script deliberately accepts only disabled source. Merely flipping the fixture gate would invalidate its receipt, so it cannot be used as a live-execution path. Before any fixture operation, write and review a separate one-run arming/build plan that binds the exact checkout, armed source and binary hashes, signer identity, private file path, parent/native journals, deadlines, expected four read categories, cleanup and failure recovery. Recheck all local baseline conditions, obtain independent review of the minimal arming diff, and seek fresh action-time approval. The existing provider credential incident remains OPEN/HOLD; a fixture PASS would not authorize provider mutation or account/cart activation.
