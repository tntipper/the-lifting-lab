# Catalogue drafts and local stock display — 3 October 2026

## Authorised scope and result

The owner asked to complete the steps possible without their intervention. Work remains within the existing full-range programme: 63 products / 74 variants, including ten supplier-zero-stock variants. No deployment, Shopify write, supplier order, email send, hosted activation or successor Stage 3 run occurred. The held incident and all commercial release checks remain open.

[Catalogue review pack](../../research/catalogue-drafts-2026-10-03/README.md) contains 63 original draft product descriptions and source-review documents, a 74-row variant matrix, 187 official image references and 61 conditional cash-price calculations. Exact labels, image reuse and price changes are not approved by this batch.

## Manufacturer evidence

Public official source captures are retained privately outside Git in `../implementation-state/manufacturer-private/2026-10-03/`, with restricted permissions. `source-review.json` records requested/final addresses, region, HTTP status, retrieval time, captured HTML hash, product-option candidates and short text research leads. No supplier login, token or customer information is in the public review pack.

62 source URLs returned HTTP 200; Reflex 100% Whey returned 404. Forty-four pages yielded structured product options. Thirty-three launch variants have one exact nonempty numeric barcode candidate on the manufacturer page. Empty, missing, zero and nonnumeric barcodes cannot create a match. A candidate is not approval: the supplied current pack/version and label still require binding.

Corrected research candidates were found for ON Isolate, ON Platinum Creatine Plus, HR Labs DEFIB and SupportMAX Joint Capsules. Prior links/titles/statuses are preserved where replaced. Current DEFIB does not establish the V3 placeholder. UK locale paths were preserved for ON structured data; TrainedByJP EU and Mutant US sources are explicitly limited for UK labels.

New evidence strengthens the existing identity holds: OPT034 has 896g vs 924g and Chocolate vs Chocolate Supreme disagreement, PER183 has 900g vs 810g disagreement, and SYN031's barcode points to Cookies & Cream despite the Vanilla listing. Existing OPT296 775g vs current brand 780g discrepancy is retained. No pack, flavour or barcode was silently replaced.

The deterministic offline builder is `scripts/build-catalogue-drafts.py`. It checks 63/74 scope, SKU coverage, 61 priced scenarios and ten zero-stock observations before writing review documents. Its two inputs are the preserved private supplier comparison and manufacturer capture JSON. It makes no network request or commerce write. Independent readback verifies output rows, source references and draft-file coverage.

## Commercial preparation

The updated unsent [supplier questions](../drafts/tropship-account-confirmation-2026-09-25.md) ask for the newer CSV's authority and formatting, actual stock time, repeated-row meaning, VAT basis/charged unit, missing REF152, exact conflicting options/current UK labels, delivery/returns exceptions and order-time reconciliation.

The new price sheet explicitly uses the current pricing module's non-VAT-registered cash basis: no output-VAT deduction or input-VAT recovery. It presents ex-VAT and VAT-inclusive supplier-quote cases, with and without TLL absorbing one £6 delivery and no customer shipping receipt. It excludes unknown payment fees, returns reserves, promotions and final grouping/shipping allocation. Five listed prices leave negative pre-delivery cash under the ex-VAT assumption; 18 do so if TLL absorbs the delivery (10 under the inclusive-quote assumption). These are review scenarios, not net profit, final price floors or recommended writes. They differ from the earlier workbook's net-of-output-VAT illustration. All approved-price cells remain blank; no RRP is invented.

## Local website change

The existing eligibility foundation retains an otherwise approved zero-stock product with an `out_of_stock` display state and no purchase target. A new small public display record in `lib/commerce/catalogue-presentation.ts` transfers only product ID, availability and `purchaseEnabled: false`; the decision result now carries its product ID so another product's decision cannot be relabelled and attached accidentally. Supplier costs, detailed approval evidence and private supplier IDs stay out of this view.

`ProductOfferLink` uses that valid display record for both product-card and sticky-action layouts. It renders inert “Out of stock / Currently unavailable to buy”, “In stock / Purchasing not enabled” or “Availability under review / Purchasing not enabled” text. Its existing retailer and synthetic-cart behaviour remains for products without that record. The shared product type accepts the optional view; it is not a database column or a raw supplier field.

**Current limit:** application routes do not yet attach these records from real catalogue approvals. No currently reviewed/approved supplier stock/identity dataset exists to wire safely. The real component is tested with synthetic, source-controlled examples; hosted pages and automatic restock updates are not proved. Future integration must evaluate exact variant approvals and freshness on the server, retain existing item IDs and prove depletion/restock end to end before enabling purchases.

## Verification

157 focused catalogue/offer tests passed. Typecheck, focused ESLint, both generated safety-record checks and the live-boundary check passed; the latter returned zero violations. The local activation manifest was refreshed for the changed disabled source hashes only, without a new run identifier or active switch.

The isolated real-component browser fixture passed at 320, 390, 768, 1024, 1280 and 1440 pixels, including each availability state in card/sticky layouts, no clickable purchase element, keyboard checks and no horizontal overflow. The 390px offer screenshot was visually inspected. These are local browser checks, not hosted acceptance.

The initial broader suite was blocked by sandbox restrictions on local servers, Chrome, Docker/process inspection and the compiler cache. With local test access, 3,288 tests passed, two were skipped and the offline whole-process test returned `KILLED`. That test subsequently passed alone in 27.5 seconds. The final serial suite passed **3,289 tests, two skipped, zero failed** in 178.1 seconds after the product-ID binding correction. The parallel failure cannot be assigned a cause solely from its generic stopped result; no timeout was widened or test weakened. The ordinary test command retains its existing four-worker setting. Final typecheck, lint, manifest checks and live-boundary check also passed.

## Stopped v18 test: fresh read-only check

On 3 October the connected Vercel deployment read again returned `READY` for `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9`, non-production target, branch `codex/tll-integration`, source `4bc8a7a28e4704f738a0b4dc1ec81717803aa622`; its creation/readiness times are unchanged. The connector build-log operation still returned `Tool get_deployment_build_logs not found`. A runtime-log read scoped to that exact deployment and approximately 20:58–21:01 UTC on 28 September returned no entries. Neither empty application logs nor a successful build identifies the local supervisor's failed substep.

The [incident diagnosis](../incidents/2026-09-29-gen23-v18-readonly-diagnosis.md) remains authoritative: direct initiating cause unknown; I01 open/P0; no successor preparation or run. The previous recovery/baseline proofs were not reasserted as freshly verified by this catalogue work.

## Next inputs

Supplier confirmation and exact current UK labels are needed to complete the held commercial/product reviews. The owner needs to choose whether to send the prepared questions, confirm commercial inputs and approve the resulting concrete prices/content when ready. Technical integration, calculation and testing can continue after those inputs; no customer launch or staged customer journey is implied by the draft pack.
