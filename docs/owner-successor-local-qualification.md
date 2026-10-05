# Local successor qualification

Run from a clean checkout with Node 24, installed locked dependencies, Git and a running local Docker daemon:

```sh
node --test tests/staging-owner-successor-fixed-source-reader.test.mjs tests/staging-owner-successor-worker-entry.test.mjs tests/staging-owner-successor-cli-runner.test.mjs tests/staging-owner-successor-native-control-acceptance.test.mjs tests/staging-owner-successor-cleanup-assembly.test.mjs tests/staging-owner-successor-default-qualification.test.mjs
```

The fixtures copy disabled source into owned temporary directories and arm only those copies. The source test uses actual disposable Git repositories and the fixed registry; only remote branch metadata transport is synthetic. The default route runs the fixed supervisor and child, fd 3 acceptance, all three fixed credential selectors with synthetic bytes, and the default constructors. HTTP, provider CLI, browser and database connection transports target synthetic endpoints and an owned network-isolated PostgreSQL fixture. No hosted provider, keychain, customer or payment operation is authorized by this command.

The PostgreSQL fixture executes 11 canonical migrations needed by this route. Its ledger includes 15 synthetic migration metadata rows; four unrelated migrations are not applied. It does not establish compatibility with the hosted database. The full route exercises Account, MyStack including reloads, Basket, pinned GET-only checkout, logout, shutdown, credential retirement and final held readback. Failure and budget cases must complete containment. Uncertain setting/setup, parent loss and cancellation remain held and deny ordinary replay before credential reads. The separate fixed cleanup entry admits only the same uncertain database-setup journal after proving its recorded supervisor, worker and process group have stopped, and uses its own durable one-use record; it cannot enable or replay the ordinary route.

A passing local receipt grants `authorization: NONE`. Tracked activation gates remain OFF. Real preflight, real owner acceptance and retirement proof, review of the complete aggregate diff, and release approval remain separate launch requirements. Freeze the candidate commit before the complete application suite and independent review; evidence from another SHA is not landing evidence.
