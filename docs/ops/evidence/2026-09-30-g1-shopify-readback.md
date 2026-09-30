# G1 catalogue readback: current Shopify variants

Observed 30 September 2026 at about 12:40 UTC. Read-only Shopify Admin queries on the connected TLL shop; no product, inventory, price, shipping, checkout or supplier write. Local source at the start of this check: `0a3c487` on `codex/tll-integration`. GitHub's integration ref remained `4bc8a7a`; production site deployment remained `dpl_4AebhGSLSpthdZRoyMt3EAcE7NpV` from `727c4f9`. The connected Shopify read is an Admin observation, not proof of what a visitor can complete in checkout.

The [98-row current variant readback](2026-09-30-shopify-variant-readback.csv) preserves exact Shopify product and variant IDs, handle, SKU, option title, price, stock settings, Admin `availableForSale` and online-store URL result. Two completed pages returned 87 products and 98 unique variants. A separate [98-row G1 disposition](2026-09-30-g1-variant-dispositions.csv) gives every variant an explicit unavailable/held state and the reason codes requiring review. These are evidence records; they do not change Shopify or make any item sellable.

| Current Admin observation | Result | G1 meaning |
| --- | ---: | --- |
| Active products / variants | 63 / 74 | Active status alone cannot approve purchase. |
| Draft products / variants | 24 / 24 | Remain unavailable. |
| Variants with zero recorded inventory | 98 / 98 | Supplier availability is unproven; zero Admin quantity is not a reliable stock decision when tracking is off or overselling is allowed. |
| Variants with inventory tracking off | 86 / 98 | `DENY` policy does not establish a stock limit when no inventory is tracked. |
| Active, tracked variants with `CONTINUE` at zero | 12 | All belong to Applied Nutrition ISO-XP; they can be configured to keep selling past zero if published. This is a release blocker until stock policy and supplier fulfilment are reviewed. |
| Active variants priced at £0 | 13 | All need a positive approved price or an unavailable product state before any publication. |
| Products published to the Online Store channel | 63 / 87 | All 63 active products, including the £0 and ISO-XP cases, are marked published by Admin. They need correction before the shop opens. |
| Products with a returned online-store URL | 0 / 87 | The URL field is null despite active Online Store publication. Do **not** interpret null as unpublished or safe. |
| Online Store password protection | Enabled | A separate Shopify Admin read confirms the shop is behind a password now. This limits ordinary public access but does not approve the product settings or prove an individual checkout path. |
| Admin `availableForSale` true | 98 / 98 | This field alone is not a public checkout result, including for drafts. |

The current 98 handle/SKU pairs match the [25 September Shopify export screen](../../research/data/shopify-current-variant-screen-2026-09-25.csv), with no change in its recorded price, product status, quantity or inventory policy. This confirms the exact current variant IDs behind those rows, which the earlier CSV lacked. The [comparison-to-Shopify screen](../../research/data/comparison-shopify-supplier-reconciliation-2026-09-25.csv) contains 61 historical mapping rows, all pointing to current variant IDs, but only **60 distinct variants**. Two TLL comparison IDs for Strom EssentialMax/EssentialMAX point to the same `STM008` variant. That duplicate was already flagged in the earlier screen and remains unresolved. The same historical screen has 168 of 229 comparison IDs without a mapped Shopify variant; comparison listing does not itself imply the item should be sold.

**Disposition today:** all 24 draft variants are `UNAVAILABLE_DRAFT`; all 74 active variants are `HELD_G1_REVIEW`. None is approved as an exact own-shop offer by this read. The `blocker_codes` column names the observable issue or missing linked approval for each row. `NO_CURRENT_PACK_COST_APPROVAL` means this G1 review has not linked current approved pack and cost evidence; it does not assert that no such evidence exists elsewhere. Keep the existing own-shop link hold in `lib/affiliate.ts` and `ProductOfferLink.tsx`. The pure `evaluateCatalogueEligibility` decision is not yet adopted by application routes, and a route should not enable offers from these Admin fields alone. The shop-wide password is a temporary access barrier, not a product approval.

The current pure pricing policy already charges **£6 gross for every TropShip supplier order**, including orders at or above £100 wholesale; price writes remain disabled. The old threshold sentence in `docs/ops/supplier-feed-ingestion.md` was corrected in this evidence batch. The commercial decisions still require current supplier tax and pack evidence, payment and reserve costs, owner-reviewed stock policy and exact comparison identity. Research approval remains a separate decision from sale approval.

## Owner's first-release range decision

On 30 September the owner chose **all 63 currently active products** for the first shop release, rather than a smaller opening range. That makes all **74 active variants** part of the G1 sellable target; the 24 draft variants remain unavailable. The earlier 25 September small-range recommendation is superseded as a scope choice, while its evidence and safety holds remain valid. The 74 variants form four non-overlapping work groups:

| Group | Products | Variants | Main proof still needed |
| --- | ---: | ---: | --- |
| Active £0 placeholders without a 14 September supplier-feed link | 13 | 13 | Establish a real supply/pack/cost path and approved positive price, or explain why that product cannot join the requested release. |
| Applied Nutrition ISO-XP, tracked at zero but set to keep selling | 1 | 12 | Confirm each flavour/size and current supplier stock path; block zero-stock overselling before opening. |
| Explicit supplier multipacks: Grenade bar and Warrior bar | 2 | 2 | Prove carton quantity, billed unit, customer pack and case economics. |
| Other active, old-feed-linked products | 47 | 47 | Obtain current pack/label, supplier cost and stock, payment/returns assumptions, then approve each exact price and Shopify variant link. |
| **Total first-release target** | **63** | **74** | All must pass the applicable G1 checks before the owner-selected full-range opening. |

The 25 September [74-SKU supplier research queue](../../research/data/tropship-first-evidence-queue-2026-09-25.csv) still marks **all 74 feed-linked variants** `HOLD` for exact-label and commercial approval; only 61 of them are in the owner's current active target. Its 14 September feed quote and stock values are stale for release. The 13 active £0 placeholders have no old feed link at all. A fresh complete supplier source and account-specific VAT/pack terms, together with current manufacturer label evidence, are the main remaining inputs. Do not convert the old `YES` feed link or size-text match into approval.

**30 September source update:** a read-only [TropShip SFTP feed retrieval](2026-09-30-tropship-feed-read.md) succeeded, but strict XML parsing failed near the end of the downloaded file. Its readable prefix matches 60 active SKUs and none of the 13 £0 placeholders. It cannot replace the requested complete, current supplier evidence or clear any variant's hold.

**Next gate work:** prepare a reviewed Shopify correction for the 13 published zero-price and 12 published overselling variants **before disabling the storefront password**. A permitted read-only storefront visibility and non-purchase checkout-boundary check remains useful afterward. Both the custom shop domain and the `myshopify.com` product URL were inaccessible from this environment (the shell could not resolve either host and the web fetch could not open them), so the individual product page was not observed. Reconcile the 60 distinct historical links and 38 unlinked Shopify variants against current labels, supplier SKU/pack, price and cost evidence. Resolve the one duplicate comparison identity. Only then can G1 approve exact own-shop links; G2 must separately prove supplier stock and order operations. No charge or test order is needed for this screen.
