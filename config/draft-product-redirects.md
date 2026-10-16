# Draft redirects — local review only

The 38 rows in `draft-product-redirects.json` come from `../k2-unpublish.csv`.
That export has product IDs, titles and vendors, but no handles or category guesses.
Handles were joined by exact Shopify product ID to the saved read-only export
`docs/ops/evidence/2026-09-30-shopify-variant-readback.csv`; all 38 matched.
Titles and vendor text are preserved. Category destinations are draft editorial
classifications using the existing category slugs, for Toby to review.

Next.js returns 308 permanent redirects only with `TLL_DRAFT_REDIRECTS=1`.
Default/unset/other values return no draft redirects. Existing size redirects
and the dashboard redirect remain as before. Setting the flag is not approval
and this work does not enable it or publish anything.

These handles may exist only at shop.theliftinglab.co.uk. Next.js controls
only the comparison site and cannot redirect requests on the Shopify domain.
The real store fix is Shopify Admin > Navigation > URL redirects: after Toby's
specific approval, review/import `shopify-draft-redirects.csv` there.
The CSV contains `/products/{exact-handle}` to the absolute comparison category
URL, `https://theliftinglab.co.uk/best/{category}`. Remove/unpublish the original
store products first: Shopify does not apply redirects while the source URL
still resolves. No Shopify import or unpublish was performed here.

# Public discovery outputs

Canonical URLs use https://theliftinglab.co.uk throughout page metadata and
structured data. Existing product text, label quantities and claims are unchanged.
`/llms.txt`, `/llms-full.txt` and `/feed/products.json` share the existing active
catalogue loader, including stored size options and nutrient values. They exclude
merged/redirected product IDs. Cache/revalidation is 900 seconds; the commerce
loader continues to opt out of the page cache when store links are enabled.
The feed explicitly allowlists fields. SKU/barcode come only from Shopify
Storefront observations, never the private supplier SKU/EAN mapping columns.
Invalid GTINs and missing identifiers are omitted from JSON-LD (null in the feed).
Prices/stock require a current approved exact mapping and a fresh store observation;
legacy retail prices are not used. Unknown prices/stock remain absent/null.
No health recommendations, aggregate offers, delivery estimates or refund duration
are inferred. Return-policy markup points to /refunds; that existing policy is
still a draft/noindex page and requires its separate approval.

Robots repeats private disallows for each explicitly allowed agent. Synthetic
preview, staging and nonproduction VERCEL_ENV remain blocked/noindex. Their sitemap
is empty. The public sitemap excludes private routes, redirected products and
noindex draft delivery/refund policies. Existing comparison/ingredient/guide
routes remain included, with every known research category added.

Schema flavour is represented as a custom PropertyValue in variesBy and
additionalProperty, rather than inventing a schema.org/flavor property.
Reference: https://schema.org/variesBy and https://schema.org/ProductGroup.
Next.js APIs checked against the version 15 metadata/robots/route documentation.
