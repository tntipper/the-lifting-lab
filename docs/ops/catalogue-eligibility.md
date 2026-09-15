# Shared catalogue eligibility foundation

`lib/commerce/catalogue-eligibility.ts` provides a pure, deterministic decision for one exact own-shop offer and one specified research context. It does not query Supabase, change a route, publish a catalogue entry, insert SQL, issue a Shopify mutation or activate a Buy button. `liveEnabled` remains false. The existing website's route helpers are unchanged until an independently tested integration adopts this projection.

## Separate decisions

The result has three explicit gates with machine-readable HOLD reasons and field paths:

- **Commerce:** the exact own-shop variant may be offered for the requested sellable quantity only when identity, commerce label, price, complete cost scope, tax approval, stock and operator clearance all pass.
- **Research:** recommendation/endorsement requires a current, independently reviewed assessment for the exact formula, label, model, evidence and requested outcome/population context. A qualified negative conclusion remains assessed and available for factual research comparison; it cannot earn an endorsement or recommendation ranking.
- **Serving value:** current commerce plus a verified label serving basis is required to display a current price-per-serving value. A value recommendation also needs the research endorsement gate. An estimated serving count can never create verified value.

The display projection distinguishes `research_listed`, `unassessed`, `shop_only` and `unavailable`; availability and assessment labels are separate. Commercially approved products with incomplete scientific assessment may remain sellable as **Not assessed**. A completed negative assessment displays **Not endorsed**, rather than being mislabelled unassessed. An unavailable offer can retain valid research evidence, because price, margins and stock do not change the underlying science. Explicit shop-only publication never silently gains research placement.

There is no universal score-50 test. Legacy `score`, brand aliases, feed-derived nutrient estimates, price and retailer relationships cannot establish research eligibility. The current source attaches scores by brand/name and several helpers use a score threshold; those values are deliberately not accepted as evidence by this interface. A later adapter must not fabricate `independentReviewComplete` from a non-null legacy score or from `status: active`.

## Required input meaning

Each approval record has a version, expected current version, explicit approval, verification time and expiry. Evaluation time is supplied explicitly. An expiry is exclusive, future-dated evidence is invalid, and stock/price freshness also applies the separately approved maximum ages. Unknown values fail the relevant gate; a missing research assessment does not erase a verified commerce decision. An expired hold remains held until a current clearance is recorded.

The input stamps are **data assertions, not authentication**. A later trusted server projection must load actual approvals, their current expected versions and source timestamps. Never accept these stamps from an unauthenticated request or manufacture them from a supplier feed flag. The module cannot authenticate a person, validate a signature or inspect a missing invoice itself.

Exact mapping verifies the comparison identity against both shop and supplier identities. Formula version, flavour, label version, pack version, selling unit, inner count, amount and dimension must all agree. Matching a name, price or total mass is insufficient: a 500g single and ten 50g items remain different packs. Pack units are explicit canonical mass (`g`), volume (`ml`) or named item counts; scoop/serving guesses are rejected. `8 × 500 ml` stays volume and `8 × 20 tablets` stays count. Conversion into these units belongs to the reviewed upstream ingestion process, not an inference inside eligibility.

Commerce labels require verified manufacturer or supplier label evidence and complete required selling information. This does not mean a scientific endorsement has been completed. A price must be positive GBP integer pence, match the exact variant and mapping, refer to the current approved cost revision, and meet its approved contribution floor. The cost gate must come from the contribution calculator and approved policy; it is not a wholesale-price proxy. Complete attributable costs, approved tax treatment and the 500p supplier fee per billable item are explicit requirements. Supplier `VAT`/`Zero` markers and truthy strings do not constitute tax approval.

Stock must represent **reconciled sellable units** after reservations/buffers and shared-SKU handling, match the exact variant/SKU/pack, remain fresh and cover the requested quantity. Raw supplier numbers are not accepted. This module consumes the projection; it does not perform reservation arithmetic or guarantee stock remains available after evaluation.

Serving evidence is bound to formula and pack revisions. Scientific evidence is additionally bound to a concrete label, model/evidence revisions and a context ID that identifies the requested outcome/population. A formula or label change invalidates the old scientific assessment. Missing labels, feed estimates, brand aliases and unknown conclusions cannot become endorsements.

## Purchase links and later integration

Only an approved exact own-shop product destination can produce `purchaseTarget`. It must use the configured HTTPS shop origin, the configured product path prefix and one exact variant query parameter. Credentials, fragments, different variants, wrong handles/origins, duplicate variant parameters and retailer referral/tracking parameters produce HOLD. The result identifies the relationship as `own_shop`. It never appends an affiliate code or constructs an Amazon/Bulk/MyProtein fallback.

Explicit retailer searches are classified `search_only` and never produce a Buy target. External exact offers are outside this own-shop assessment's current scope and are also not converted into own-shop targets. A later external-offer implementation needs its own destination/price/relationship verification; it must not inherit the own-shop cost or stock result.

Use the same projection for future browse, Best/Value/Deals, wizard, search, shop cards and agent responses. Build the projection from a consistent versioned snapshot, preserve each HOLD reason and re-read affected versions before a purchase/price mutation. Include availability and assessment separately in UI/API contracts. Do not report the audit findings as released or closed merely because this pure module has passed its tests.

The old [catalogue PR #2](https://github.com/tntipper/the-lifting-lab/pull/2) was read only for its historical ideas about excluding unknown costs and avoiding purchase-link fallbacks. Its source backfills, SQL instructions and old verification claims were not applied or adopted as current evidence.

## Verification

80 Node tests cover ordinary eligible offers; sellable unassessed and shop-only records; negative reviewed conclusions; commerce/science independence; no score threshold; mass/volume/count mismatches; single-versus-multipack identity; missing, unapproved, stale, expired and future data; explicit operator holds; insufficient/raw stock; below-floor/zero prices; serving estimates; exact variant URLs; affiliate/search fallbacks; and tax-marker rejection. All fixtures use synthetic records and `example.invalid` domains. No supplier invoices, customer records or private tax status are included.

```sh
node --experimental-strip-types --test tests/catalogue-eligibility.test.mjs
```

Strict TypeScript checking and focused ESLint also pass. These tests establish the decision function's behaviour, not live source accuracy, regulatory/scientific sign-off, stock reservation, checkout enforcement or route adoption.
