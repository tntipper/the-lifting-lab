# Development dependency CI controls

This narrow CI successor preserves reviewed aggregate ff6925c155a77b41c2db78caf5968c8fb16d37e0. Its lockfile SHA-256 remains 40e1262c6290bc408c112bfd0d5bbd15d5c1ae2cb84d379125bd6f9fb407e0b9. The aggregate passed its complete owned Linux composite with Node24.21.0/npm11.19.0. Successor verification must bind its own exact SHA; prior evidence does not prove new workflow behavior or hosted checks.

The aggregate audit reports 37 affected dependency/metavulnerability entries (27 high, eight moderate, two low), representing 32 distinct direct advisory URLs. All affected installed nodes are development dependencies. Production-only audit reports zero; neither observation closes development/build risk.

## Concrete controls and reachability

| Portfolio / job | Mitigation in this increment | Residual risk and next fix |
| --- | --- | --- |
| Install lifecycle scripts: application, accessibility, customer/cart | Locked npm ci --ignore-scripts; npm11.19.0 installation also disables scripts. Linux compatibility requires lint, native CSS/images, build and browser qualification. | Registry downloads and explicit Playwright browser/OS installation still execute selected tooling. This is not arbitrary-code isolation. Retain exact lock/source and disposable secret-free workers. |
| Braces3.0.3 via Next ESLint → fast-glob3.3.1 → micromatch4.0.8: lint | Reviewed repository patterns/configuration only; finite disposable job, no uploaded patterns/configuration, no persistent checkout credentials. | Stack exhaustion remains reachable through lint input. GHSA-vfj7-8cjw-p6xm currently has no patched version. Revisit upstream fix rather than automatically downgrading eslint-config-next. |
| Vercel60.1.3 transitive undici/busboy/path-to-regexp/js-yaml/minimatch/smol-toml/ajv/once and duplicate Braces | Application verification calls locked Next and Playwright paths directly, never the Vercel CLI. Disabled lifecycle scripts prevent project install hooks. | CLI tree remains installed, not patched. This mitigation does not cover automatic Vercel Preview builds or a future CLI invocation. Separate the CLI/tool environment or remove the unused dependency in a separately requalified change. |
| tsx nested esbuild development-server advisory | Ubuntu jobs perform tests/compilation, not a Windows development server. | Windows server scenario is constrained, not a general closure of esbuild/network/parser advisories. Preserve direct-tool execution and finite jobs. |
| Auth/storage Supabase CLI acquisition | npm version now explicit; existing CLI2.117.0 and disposable local fixture scope retained. | Its separate npx acquisition is not covered by project npm ci --ignore-scripts. Do not expose hosted secrets or claim install-script isolation for this job; qualify installer changes separately. |

Website CI lane owns these controls; project owner retains release/credential-bearing build decisions. Revisit remaining package-chain fixes before the 9 October launch decision, whenever source/lock/toolchain changes, and before any credential-bearing build. Each later exception must name the affected advisory, reachable command and bounded job. There is no blanket acceptance of all37 entries. Do not use audit fix --force, suppress the production audit, or delete failing tests.

## Workflow bounds and regression coverage

All eight jobs read exact Node24.21.0 from .nvmrc; each npm-using job explicitly installs/logs npm11.19.0. SHA-pinned actions, contents:read, concurrency cancellation, synthetic application values and existing 10–20 minute timeouts remain. Checkout no longer persists the Git token. A read-only token is still a credential during checkout and is not execution isolation. No hosted application secrets, supplier traffic or commerce activation are added.

Application CI now runs npm run test:privacy explicitly (nested privacy/native CSS/image regressions), then existing integration, production audit and build checks. It starts the built app on loopback and runs the existing seven consent and four URL-minimisation browser cases with finite readiness and an EXIT cleanup trap. The accepted harness uses a synthetic intercepted collector204 and read-only Google SDK: this proves observed client behavior, not hosted ingestion or genuine owner acceptance. Existing comparison/mobile, accessibility and offline conflicting-environment runtime checks remain.

Hosted workflow execution remains unverified until a separately authorized publication. The PR trigger checks GitHub's merge ref by default: record both source head and merge SHA/tree in hosted evidence. Automatic Git integration can also create a protected Preview and consume billed build/runtime resources; GitHub CI controls do not change Vercel install/build settings. Publication, production launch, purchases and marketing remain separate decisions.
