# Generation 23 v16: Vercel scope preflight hold

Date: 28 September 2026

## Result

The single v16 launcher invocation returned `RECONCILIATION_REQUIRED` before its whole-route journal was created. No v16 one-use record exists. The protected Preview remained held, its cart route returned 404, and no database, provider, website, browser, checkout or purchase action was reached.

## Cause

The local arming-source proof passed and bound the local-only execution commit to exact published disabled commit `abd0382b453c84a891e9bd0195603a51a500ad39`. Vercel then rejected the saved API token during the read-only alias lookup with error code `forbidden`: the token no longer had access to scope `my-lifting-lab-s-projects`.

The owner created a replacement token scoped to that team and saved it directly to the existing macOS Keychain item. No token value entered the chat, repository, logs or evidence.

## Fresh verification

The replacement token resolved the protected branch alias to deployment `dpl_2C9vguPo1cPFCbtfs42nsN6TfcZR` and immutable URL `https://the-lifting-o37ogdrid-my-lifting-lab-s-projects.vercel.app`. Vercel reported that deployment Ready from exact branch `codex/tll-integration` and commit `abd0382b453c84a891e9bd0195603a51a500ad39`.

Protected immutable reads then proved:

- private customer false;
- private cart false;
- public customer false;
- public cart false;
- checkout handoff false;
- staging Shopify variant `gid://shopify/ProductVariant/57160491139412` priced at 1,971 pence.

The local branch was returned to the exact disabled published commit. The v16 arming commit remains local-only evidence and must not be pushed or replayed. V17 uses a fresh window identity, Edge revision and twenty fresh record paths.
