# Supplier feed ingestion foundation

This local, deterministic parser produces evidence and draft candidates. It has no supplier fetcher, database client, Shopify client, scheduler, apply command or catalogue mutations. `writesEnabled`, `approved`, `sellable` and `priceWriteAllowed` always remain false. `READY_FOR_REVIEW` describes ingestion quality; it is not permission to sell or change a price.

The public repository contains synthetic tests only. Keep original supplier CSVs, private metadata and full JSON plans outside the repository. The complete plan contains supplier identifiers, quotes and raw nutrition HTML. The default CLI output and `summarizeFeed` contain aggregate counts and source metadata, without product records. Choose non-secret source/evidence identifiers for metadata.

## Contract and accounting

`planSupplierFeed(rawBytes, options)` returns the JSON-safe `FeedSnapshot` contract in `lib/commerce/supplier-feed.ts`. Its SHA-256 covers the exact original bytes, including BOM and line endings. Each parsed logical data record has a one-based `recordNumber`, original parsed `rawFields`, and a SHA-256 of `JSON.stringify(rawFields)`. The per-record hash is a field-content hash, not an original-byte hash. Parser line numbers are diagnostic hints; quoted CRLFs can affect the parser's count. Use the logical record number and full source hash to identify evidence.

The header must match the exact 14 names and their order. UTF-8 decoding, quoting and escaping are strict. A BOM is supported. Quoted commas, escaped quotes, multiline fields and CRLF are retained. Blank records are counted and held, not silently skipped. Neither whitespace trimming nor value casting is enabled. The parser is bounded to 50 MB per snapshot, one million characters per record and 100,000 data records.

Wrong-width records are retained solely to diagnose the error: their `fields` and `observations` are null, and `SNAPSHOT_COLUMN_COUNT_MISMATCH` holds the whole snapshot. Under an exact header, the raw first field is still recorded as `claimedProductCode` so malformed rows cannot disappear from duplicate groups. It is never an approved identity. No shifted price, stock or nutrition field is interpreted.

A fatal quote, encoding or resource error sets `accounting.complete=false` and `totalDataRecords=null`. Already parsed records remain available, and every candidate is held. The unparsed tail is explicitly unknown. A permissive parser may produce a larger diagnostic count from the same bytes, but that count does not prove valid CSV or complete trustworthy accounting. Obtain a corrected supplier export instead of relaxing the producer or selecting a plausible repair. A header-only or empty snapshot is held.

For a completely parsed snapshot:

- `validWidthRecords + invalidWidthRecords = parsedDataRecords = totalDataRecords`.
- Every record either belongs to exactly one claimed-code candidate or contributes to `unassignedRecords`.
- `recordsWithIssues` counts records once; each entry in `issueRecordCounts` counts records carrying that specific reason. One record can have several reasons.
- Duplicate groups contain every matching record. Identical duplicates remain ambiguous. Stock is never summed, a record is never chosen by date, and a duplicate candidate has no selected record.
- Possible case/whitespace identity collisions are flagged without changing the original code.

## Meaning is deliberately constrained

| Source evidence | Interpretation permitted by this layer | Further approval required |
| --- | --- | --- |
| `ProductPrice` | Exact positive GBP quote in pence, bounded to £10 million | Written tax basis, cost version, supplier fees, margin policy and pricing calculation |
| `Tax` equal to `VAT` or `Zero` | Recognized supplier flag, preserved verbatim | Economic VAT treatment; neither flag is a tax-basis approval |
| `StockLevel` | Integer observation; negative, fractional, missing or overflowing values are held | Supplier row grain, trusted observation time, quantity units and reconciliation before availability |
| `Size` | Raw label, including apparent multipacks | Exact pack contents and supplier billable sellable quantity; no quantity inference |
| `Barcode` | Raw string plus checksum/shape check for GTIN lengths 8/12/13/14 | Verified manufacturer/supplier mapping; passing checksum alone proves no product identity |
| `NutritionalInformation` | Opaque raw content | Scientific label review and the versioned scoring pipeline; no HTML extraction here |
| Product flags and dates | Raw source fields | Documented supplier semantics, expiry/batch handling and commercial policy |

Money accepts plain decimal strings with zero, one or two fractional digits and no leading-zero padding. It rejects blank, zero, negative, signed, scientific, comma-separated, currency-prefixed, whitespace-padded and over-precision values. BigInt arithmetic converts to pence exactly; there is no floating-point multiplication or rounding of malformed prices. The bounded final pence number is JSON-safe.

Barcode leading zeroes are preserved. Missing, malformed, all-zero or checksum-failing codes are held, never repaired. Code, product name, brand and raw size must be present for a clean review candidate. Zero stock can be recorded but never becomes sellable approval.

Every candidate is `DRAFT_CANDIDATE_ONLY`. The planner has no existing-catalogue input and does not claim that a candidate is a newly created SKU or an update. A later reconciliation worker must match it to trusted existing mappings before proposing any action. No mapping, formula, cost basis, price, stock availability or product status is approved by ingestion.

The separate pricing policy still requires the supplier delivery amount of 500 pence per approved billable quantity. This parser neither assigns that quantity nor invents the fee's tax treatment. Customer shipping revenue is outside the feed contract.

## Freshness and supplier grain

`receivedAt` is this ingestion's receipt time. `fileModifiedAt` is optional filesystem evidence. Neither substitutes for `supplierObservation.observedAt`. All policy times are explicit canonical UTC timestamps, and `evaluatedAt` is supplied by the caller so replay is deterministic.

A supplier observation passes only when it has an exact timestamp, `trusted=true`, a nonempty evidence identifier, is no later than receipt/evaluation, and has not reached `observedAt + maxObservationAgeMs`. A filename or a date-only description does not pass. Re-reading or reapproving old bytes does not refresh the source observation. The caller must choose an appropriate freshness policy; the example interval below is a synthetic demonstration, not a stock-refresh SLA.

`rowGrain.status` defaults operationally to `unknown`. Only documented supplier evidence may establish `approved_unique_sellable_unit`. The caller is responsible for obtaining that evidence; this local layer cannot authenticate a claimed approval. Even an approved grain does not resolve duplicate codes or authorize deriving pack quantity from `Size`.

Example metadata for a synthetic fixture:

```json
{
  "provenance": {
    "supplierId": "synthetic-supplier",
    "sourceId": "synthetic-fixture",
    "receivedAt": "2026-09-15T10:00:00Z",
    "fileModifiedAt": null,
    "supplierObservation": null,
    "rowGrain": { "status": "unknown" }
  },
  "evaluatedAt": "2026-09-15T10:00:00Z",
  "maxObservationAgeMs": 86400000
}
```

This example intentionally returns `HOLD` for unverified observation and unknown grain. Do not change those fields merely to obtain a green result.

## Local dry run and validation

```sh
node --experimental-strip-types scripts/plan-supplier-feed.mjs \
  --input /private/path/feed.csv \
  --metadata /private/path/metadata.json \
  --summary-output /private/path/summary.json
```

`--plan-output /private/path/plan.json` explicitly requests the full sensitive evidence plan. Output files are created exclusively with mode `0600`; existing files are not overwritten. There is no `--apply` flag. The CLI prints the aggregate summary and exits `0` for review-ready ingestion, `2` for an expected HOLD, or `1` for a CLI/filesystem failure. A `0` exit still leaves all live actions disabled. The input CSV and metadata are read only. Output creation is local and not transactional across two requested output files.

```sh
node --experimental-strip-types --test tests/supplier-feed.test.mjs
node_modules/.bin/tsc --noEmit --strict --target ES2017 --module esnext \
  --moduleResolution bundler --skipLibCheck lib/commerce/supplier-feed.ts
node_modules/.bin/eslint lib/commerce/supplier-feed.ts \
  tests/supplier-feed.test.mjs scripts/plan-supplier-feed.mjs
```

Tests cover exact money boundaries, quote/BOM/multiline preservation, complete and incomplete accounting, shifted fields, duplicate and normalization collisions, negative stock, missing/unverified barcodes, freshness expiry/future/date-only cases, opaque nutrition/pack labels, no commerce approvals, deterministic replay and exclusive private local outputs. These checks do not establish supplier SLA, batch semantics, manufacturer accuracy, tax approval or API reconciliation behaviour. Those are later integration gates.

The parser is pinned to `csv-parse` 7.0.2. Its [sync API](https://csv.js.org/parse/api/sync/) supplies bounded in-memory parsing, and its [column-count relaxation](https://csv.js.org/parse/options/relax_column_count/) is used only to retain malformed-width evidence before holding the snapshot. Other [parser options](https://csv.js.org/parse/options/) remain strict; no record-error skipping or loose quoting is enabled.
