# Generation 19 hosted retirement

Date: 2026-09-22  
Target: staging project `qdmvngjwkcsilzmqksme` only  
Production excluded: `wrhgscovsgsudtedbljr`

## Outcome

Generation 19 is retired. Vercel customer/cart public and server flags remained
disabled throughout. No purchase, checkout, production access, customer email,
credential value or customer identifier was used or exposed.

Fresh exact-drift preflight receipt immediately before the successful action:

```json
{"status":"PASS_EXACT_ACTIVE_DRIFT","queryId":"tll-staging-generation-19-retirement-preflight/v2","windowId":"51809dd4-bd4b-44c7-8609-7dd8ca063679","generation":19,"migrations":15,"projectRef":"qdmvngjwkcsilzmqksme","runtimeRoles":5,"operatorEdges":5,"executionEdges":5,"controlsEnabled":5,"credentialDrift":"MARKER_EXPIRED_ROLE_UNBOUNDED","runtimeSessions":0}
```

Fresh-session post-commit receipt:

```json
{"status":"PASS_RETIRED","queryId":"tll-staging-generation-19-retirement-postcommit/v1","windowId":"51809dd4-bd4b-44c7-8609-7dd8ca063679","generation":19,"projectRef":"qdmvngjwkcsilzmqksme","runtimeRoles":5,"operatorEdges":5,"executionEdges":0,"controlsEnabled":0,"runtimeSessions":0,"passwordsConfigured":0}
```

The proof additionally asserted exact retired marker JSON, `NOLOGIN`, cleared
passwords through `pg_authid`, no direct runtime ACLs, no PUBLIC usage on TLL
private schemas, exactly five inert ADMIN-only runtime-to-operator management
edges, and no other membership touching a runtime role.

## Drift corrected

All five active role markers had expired at
`2026-09-21T11:08:34.000Z`, while the roles still had LOGIN, passwords and
`VALID UNTIL infinity`. The fixed v2 preflight pinned that exact state before
the one-time retirement.

## Failed attempts and prevention

Three attempts failed inside their transaction and rolled back completely:

1. a combined postflight assertion used the redacted `pg_roles.rolpassword`
   field and produced a misleading missing-edge message;
2. the next proof still used the redacted password field and correctly rolled
   back;
3. an interim zero-membership assumption rejected the five management edges
   that actually survive retirement and rolled back.

The final generated proof separates each condition, reads password state only
from `pg_authid`, requires the five inert management edges and rejects every
executable edge. These corrections are committed on `codex/tll-integration` at
`0cbe74f8cccf95f65650706c7c272ed8d914e258`.

Do not replay Generation 19. Any later activation requires a fresh successor,
new boundary review and new one-time credentials.
