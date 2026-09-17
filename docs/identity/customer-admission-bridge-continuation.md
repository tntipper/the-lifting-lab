# Private admission-to-registration continuation

`createCustomerAdmissionBridgeContinuation` connects the actual admission coordinator to migration 010's atomic SQL registration. It is unmounted and disabled by default; `liveEnabled` remains false. Synthetic execution permits the isolated local tests. It creates no browser cookie, route, runtime LOGIN, credential, provider setting, Shopify request, final exchange or authenticated session.

The continuation owns its request-scoped coordinator. `startSignIn({browserSecret})` and `startMigration({browserSecret})` generate one admission attempt and may register only the coordinator's immediately acknowledged finish result. There is no public `continue(candidate)` or `register` API, no caller-selected proof, and no registration path from metadata inspection. The browser secret must come from trusted extraction of a server-created canonical 32-byte private transaction cookie. One instance starts at most one transaction, including a failed attempt.

The constructor receives separate bounded pools for the 008 provisional executor and the 010 bridge executor, the existing provisional vault, immutable approved staging origin, publishable key and actual request-scoped token accessor. Session/admission transports are trusted server/test dependencies. Each pool must lease an idle client with bounded connection, acquisition and query deadlines. The bridge transaction sets five-second lock, ten-second statement and fifteen-second idle-transaction limits; HTTP verification happens before that transaction. No outer retry or background completion is installed.

## Authority retained through the transaction

After the coordinator's finish acknowledgement, the continuation captures the original transaction/browser/config/intent/application-PKCE binding, admission operation, claim fence, generation and normalized outer hash. It generates one distinct registration operation UUID and one fresh 32-byte release secret. An 008 metadata read must match that captured binding, generation, mode, exact origin and outer tuple. The existing repository validates the metadata's configuration and intent digest. The read supplies the original owner and expiry for verification; it does not create registration authority.

Migration invokes the actual current-session reader again after admission. Its authenticated `GET /user` must verify the original UUID, original session and exact retained access-token hash. The accessor is reread by the reader, before registration after pool acquisition, and after the commit acknowledgement. Authentication must remain younger than five minutes, proof younger than five seconds, and token/source expiry live. SQL checks freshness again after its G → B → P gate wait. Sign-in carries no owner or migration proof. Email and mutable metadata have no authority.

`customerBridgeReleaseHash(secret, recovery)` hashes the UTF-8 JSON serialization of this explicitly ordered array using SHA-256:

```text
[
  "tll-bridge-release/v1", releaseSecret,
  transactionId, browserHash, configHash, intentHash,
  applicationPkceChallenge, admissionOperationId, admissionFence,
  generation, outerHash, registrationOperationId
]
```

Only the digest enters SQL. The raw browser secret, release secret, application verifier and access tokens do not enter the bridge payload. The digest helper is for trusted server derivation, not a browser request field or authentication proof.

The bridge validates the complete registration receipt before COMMIT: exact status, original transaction ID and unchanged expiry, with no extra fields. The continuation returns `private_registered` only after COMMIT and client release succeed and the final expiry/session consistency checks pass. That server-private result contains the immutable recovery tuple, original expiry, normalized authorization URL and release secret. It must not be logged, serialized into generic responses or treated as completed login. Protected cookie delivery remains separate work.

## Uncertainty and terminal operations

Every unsuccessful continuation after admission retains its original binding, releases no URL/secret and attempts one atomic hold using that same captured registration operation. Query, commit, client-release and post-commit consistency failures take this path. A failed hold is recorded as `quarantine: unacknowledged`; the module never retries it. When registration committed but its acknowledgement was lost and the hold also did not arrive, pending database authority may remain, but the private release secret was never returned. Inspection cannot recover it.

`hold`, `cancel` and `inspect` accept only a canonical private recovery tuple plus the original browser secret. The module checks the browser hash and immutable configured origin's config digest before SQL; SQL validates the exact source/claim/outer tuple and rejects foreign substitutions. Cancellation generates a new operation ID. An uncertain cancellation gets at most one hold with that cancellation operation. A `cancelled` result requires an acknowledged matching SQL response. A held/uncertain result describes the safety outcome, not an assertion that every row is durably in the held state.

`inspect` projects only `metadata_only`, retained state, original expiry, observation time and current-epoch status. It never exposes an outer URL, release digest/secret, verifier, token or registration capability, and has no transition side effect. It cannot restart admission, retry registration, extend expiry or reissue a secret.

The durable 007 adapter's `admit` accepts an optional trusted `releaseHash`. Omission preserves standalone 007's existing payload and behavior. A present value must be a canonical SHA-256 digest; arbitrary extras are projected away. Installed 010 still rejects missing, wrong or reused release capability. This changes no protocol-core browser endpoint: future protected wiring must derive the digest from the retained tuple and separate private release cookie before calling the adapter.

## Verification

```sh
node --experimental-strip-types --test tests/customer-admission-bridge-continuation.test.mjs
node --experimental-strip-types --test tests/admission-bridge/continuation.test.mjs
```

The focused offline suite checks disabled boundaries, malformed/caller-proof inputs, every release-digest field and standalone 007 payload compatibility. The PostgreSQL suite uses the existing marked `tll_admission_bridge` fixture, actual coordinator/provisional/bridge/broker adapters and signed synthetic HTTP. It covers acknowledgement ordering, missing/reused release capability, uncertain registration/hold, metadata-only recovery, original binding/expiry, session changes, proof timeout/freshness, exact terminal propagation and rejected cancellation after hold. It leaves all three controls disabled, workload empty and clients closed. Run it only with exclusive fixture ownership and separately from bridge migration proofs. These tests make no hosted acceptance or browser-delivery claim.
