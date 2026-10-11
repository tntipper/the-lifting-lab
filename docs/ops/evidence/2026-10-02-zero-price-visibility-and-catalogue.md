# Zero-price visibility and catalogue — 2 October 2026

## Scope and entry evidence

The owner instructed that products priced at £0 should not be visible on the store and requested an Excel catalogue for the agreed 63-product first-release scope. This checkpoint treats “zero” as the Shopify selling price; stock quantity is a separate unresolved control. Stage 3 remains held.

The 30 September Shopify readback contained 63 ACTIVE products/74 variants, including 13 one-variant £0 placeholders. On 2 October the connected Shopify Admin search and individual product reads reconfirmed those 13 as ACTIVE at £0 before the change. The shop identity was The Lifting Lab, GBP, `shop.theliftinglab.co.uk`.

## Change and independent readback

The owner-authorised Shopify Admin bulk status change set the 13 £0 products to DRAFT. The connector reported 13 succeeded and 0 failed. A separate read of every changed product returned DRAFT with its £0 variant price retained. A complete current Admin read of the agreed 63 products returned 50 ACTIVE products/61 positive-price variants and 13 DRAFT products/13 £0 variants. No price, inventory, password, order, supplier or staging setting was changed. An individual public storefront page was not tested, so this is an Admin status proof rather than a browser proof.

This visibility correction does not close the 12 active ISO-XP zero-stock CONTINUE issue, exact pack/identity, cost, VAT, current stock or G1 approval. It does not resolve the separate 12 underpriced products already placed in Draft under F36.

## Excel catalogue and financial basis

The workbook at `outputs/01a0eec0-23d2-75a3-8826-52bfed59e4ab/TLL_product_catalogue_2026-10-02.xlsx` contains all 63 products and 74 size/flavour variants, their live Shopify prices/statuses, category, 61 matched historical TropShip wholesale prices, feed VAT flags, official brand links and 16 dated public brand-price observations. No explicit manufacturer RRP was established, so the RRP cells are blank. Brand observations include family-level or unselected options; the workbook states match scope per row.

The supplier prices are from the 14 September feed and are **not current approved costs**. The retrieved 30 September supplier file remains malformed. The supplier has not confirmed whether XML `ProductPrice` is inclusive or exclusive of VAT. The workbook therefore calculates two illustrative gross-profit and margin cases, using the supplier VAT flag as an assumed item rate and assuming the Shopify price includes VAT. Both cases exclude the account-specific £6 including VAT delivery charge per supplier order, card fees, returns and promotions. Five variants show negative illustrative gross profit under the ex-VAT supplier-cost case: OPT034, STM044, WAR014, BLK101 and OPT156. These are questions for price/pack review, not approved price writes.

## Verification and remaining work

The saved XLSX archive passed integrity check. It contains 296 catalogue calculation formulas and seven overview formulas; sample APP385 calculations were independently checked (£22.37 profit/53.7% margin if wholesale ex VAT; £25.58/61.4% if wholesale inc VAT). Workbook inspection found no formula errors; source counts and negative-profit count match an independent calculation. Both sheets were visually reviewed. Source code revision for this record: `ca6c9676138d9951ac10c47caa504ed7f1a8eef5`; no site deployment was made.

Next G1 work remains a corrected complete current TropShip feed, per-SKU VAT basis and classification, exact pack/flavour/barcode and stock evidence, then an approved pricing decision for each of the 74 variants. Keep the £0 placeholders Draft. G3 live run remains held pending the v18 cause and preventive-control review plus a separate owner approval.

## 2 October supplier recheck

A second read-only SFTP download used the host fingerprint verified against the supplier guide. It returned 7,950,965 bytes with SHA-256 `3dcdeb7620326d1cfa345c77f0993e6da775d0ccd4d940dc343a25f6d7dc8170`, byte-identical to the 30 September copy. Strict XML parsing still fails at line 140915, column 11. The temporary local download was removed after validation. No supplier order or write occurred. This recheck does not supply current complete costs or stock, so the workbook continues to label 14 September prices as historical.

## Further owner-requested supplier download — 2026-10-02T06:24:27+00:00

At the owner's request, a fresh authenticated read-only download of `DropshipProductFeed.xml` succeeded after the supplier host key matched the previously verified fingerprint. The download again contained 7,950,965 bytes with SHA-256 `3dcdeb7620326d1cfa345c77f0993e6da775d0ccd4d940dc343a25f6d7dc8170`, identical to the retained 30 September file and the earlier 2 October recheck. Complete-file XML validation again failed at line 140915, column 11. The temporary downloaded copy was automatically removed after validation. No current file-listing modification time or supplier stock-observation time was obtained in this check.

Result: no updated complete supplier information was received. The known partial-prefix findings remain diagnostic only; current cost/stock approval and G1/G2 remain held. No Shopify, supplier, order or Stage 3 setting was changed. Next: obtain a corrected complete feed or an alternative supplier-provided current export, together with stock observation time and price VAT basis.

## Download-method audit and newer CSV discovered — 2 October 2026

The supplier setup guide specifies SFTP and `DropshipProductFeed.xml` in the account's initial folder. The connection reads its host, port and account directly from that guide, and validates the host key against the previously verified fingerprint. A fresh remote `pwd` returned `/`. Two fresh XML downloads were identical, their byte count matched the server's 7,950,965-byte listing, and the transfer reported 100% completion. Python XML parsing and independent `xmllint` both rejected the complete file; 30,304 bytes follow the first `</Products>` closing tag. The XML download method is consistent with the guide, but the earlier checks omitted a complete directory listing.

That listing exposed a second file, `DropshipProductFeed.csv`, dated 2 October. Its listed time differs by one hour between listing formats (06:10 versus 07:10), so no time zone is inferred. Two fresh CSV downloads were identical and matched the server's 4,429,174-byte size; SHA-256 is `3ad4cd1d4d61667bab484f34532c8c67b03b3d9ff85d0ff3b8059b101d1e8a06`. The raw CSV and private receipt were saved outside Git in `../implementation-state/supplier-private/received-20261002T062926Z-DropshipProductFeed.csv` and its `.metadata.json` sibling, with mode 0600.

The CSV has the expected 14 supplier columns, including `ProductPrice`, `StockLevel`, `Tax`, `Size` and `Barcode`. Strict CSV parsing fails at physical line 2362 with a quotation/separator error. A permissive diagnostic reader returns 8,743 rows with 14 columns; that alone does not prove semantic correctness or approve import. The prior conclusion that no newer feed file was available was too broad: the XML is stale/broken, while a newer CSV exists and has been retrieved. Next: assess the CSV's quoting rules and complete record accounting using the existing disabled supplier parser, reconcile the launch SKUs, and retain cost/VAT/stock holds until those checks pass. No Shopify price/stock or Stage 3 setting changed.
