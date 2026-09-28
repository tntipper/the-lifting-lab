import { createHash } from 'node:crypto'
import { parse } from 'csv-parse/sync'

/** Parsing evidence is separate from permission to change a catalogue or a price. */
export const FEED_WRITES_ENABLED = false
export const FEED_HEADER = Object.freeze([
  'ProductCode', 'TranslationName', 'Tax', 'StockLevel', 'Barcode', 'Brand',
  'Flavour', 'FilterByCategory', 'NutritionalInformation', 'Size', 'ProductFlag',
  'ProductFlagDate', 'ProductPrice', 'ExpiryDate',
] as const)
export const FEED_LIMITS = Object.freeze({ bytes: 50_000_000, recordCharacters: 1_000_000, rows: 100_000, pricePence: 1_000_000_000 })
type FeedColumn = typeof FEED_HEADER[number]
export type RawFeedFields = Record<FeedColumn, string>
export type FeedIssue = { code: string; field?: string }
export type FeedProvenance = {
  supplierId: string
  sourceId: string
  receivedAt: string
  fileModifiedAt?: string | null
  /** Only a trusted supplier observation is allowed to establish freshness. */
  supplierObservation: { observedAt: string; trusted: boolean; evidenceId: string } | null
  rowGrain: { status: 'unknown' | 'approved_unique_sellable_unit'; evidenceId?: string }
}
export type FeedOptions = {
  provenance: FeedProvenance
  evaluatedAt: string
  maxObservationAgeMs: number
}
export type FeedRow = {
  /** One-based logical data-record index; the header is excluded. */
  recordNumber: number
  /** Parser-reported line hint; logical recordNumber is the stable row identity. */
  parserEndLine: number
  fieldsSha256: string
  rawFields: string[]
  /** Raw first field under an exact header, retained for grouping even when later fields are shifted. */
  claimedProductCode: string | null
  /** Absent if the header or width is wrong: shifted columns are never interpreted. */
  fields: RawFeedFields | null
  issues: FeedIssue[]
  observations: {
    productCode: string | null
    wholesaleQuotePence: number | null
    quoteCurrency: 'GBP'
    quoteUnit: 'unresolved_supplier_size'
    stockLevel: number | null
    barcode: { raw: string; status: 'missing' | 'valid_gtin' | 'unverified'; normalized: null }
    taxBasisApproved: false
    billableQuantity: null
    scientificFields: null
  } | null
}
export type DraftCandidate = {
  action: 'DRAFT_CANDIDATE_ONLY'
  supplierProductCode: string
  recordNumbers: number[]
  /** Never choose a row from a duplicate group, even if its fields are identical. */
  selectedRecordNumber: number | null
  status: 'HOLD' | 'REVIEW_REQUIRED'
  issues: FeedIssue[]
  approved: false
  sellable: false
  priceWriteAllowed: false
  mapping: null
  costApproval: null
  formulaApproval: null
}
export type FeedSnapshot = {
  schemaVersion: 'tll-supplier-feed/v1'
  writesEnabled: false
  ingestionStatus: 'HOLD' | 'READY_FOR_REVIEW'
  provenance: FeedProvenance
  evaluatedAt: string
  maxObservationAgeMs: number
  rawSha256: string
  rawBytes: number
  issues: FeedIssue[]
  header: string[] | null
  accounting: {
    complete: boolean
    /** Null after a syntax/resource error: records in the unparsed tail are unknown. */
    totalDataRecords: number | null
    parsedDataRecords: number
    validWidthRecords: number
    invalidWidthRecords: number
    recordsWithIssues: number
    unassignedRecords: number
    duplicateCodeGroups: number
    recordsInDuplicateGroups: number
    uniqueProductCodes: number
    issueRecordCounts: Record<string, number>
    parserFailure: { code: string; parserLine: number | null } | null
  }
  rows: FeedRow[]
  candidates: DraftCandidate[]
}

const hash = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex')
const issue = (code: string, field?: string): FeedIssue => field ? { code, field } : { code }
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** Canonical UTC only. Reject calendar rollover, date-only values and inferred time zones. */
function utc(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z')) ? ms : null
}

/** Exact decimal parsing: no floating multiplication, coercion or rounding bad quotes. */
export function parseWholesalePence(raw: string): { pence: number | null; issue: string | null } {
  if (typeof raw !== 'string' || raw === '') return { pence: null, issue: 'PRICE_MISSING' }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return { pence: null, issue: 'PRICE_INVALID_DECIMAL' }
  // Bound the string before BigInt conversion as well as the resulting pence.
  if (raw.length > 16) return { pence: null, issue: 'PRICE_OVERFLOW' }
  const [whole, fraction = ''] = raw.split('.')
  const pence = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))
  if (pence <= BigInt(0)) return { pence: null, issue: 'PRICE_NON_POSITIVE' }
  if (pence > BigInt(FEED_LIMITS.pricePence)) return { pence: null, issue: 'PRICE_OVERFLOW' }
  return { pence: Number(pence), issue: null }
}

function gtin(raw: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(raw) || /^0+$/.test(raw)) return false
  let sum = 0
  for (let index = raw.length - 2, position = 0; index >= 0; index--, position++) sum += Number(raw[index]) * (position % 2 === 0 ? 3 : 1)
  return (10 - sum % 10) % 10 === Number(raw[raw.length - 1])
}

function checkProvenance(options: FeedOptions): FeedIssue[] {
  const result: FeedIssue[] = []
  const p = options.provenance
  if (!p || typeof p !== 'object') return [issue('PROVENANCE_MISSING')]
  for (const field of ['supplierId', 'sourceId'] as const) if (!nonempty(p[field])) result.push(issue('PROVENANCE_INVALID', field))
  const evaluated = utc(options.evaluatedAt), received = utc(p.receivedAt)
  if (evaluated === null) result.push(issue('EVALUATION_TIME_INVALID'))
  if (received === null) result.push(issue('RECEIPT_TIME_INVALID'))
  if (received !== null && evaluated !== null && received > evaluated) result.push(issue('RECEIPT_IN_FUTURE'))
  if (p.fileModifiedAt != null && utc(p.fileModifiedAt) === null) result.push(issue('FILE_MODIFIED_TIME_INVALID'))
  const ageValid = Number.isSafeInteger(options.maxObservationAgeMs) && options.maxObservationAgeMs > 0
  if (!ageValid) result.push(issue('FRESHNESS_POLICY_INVALID'))
  const observation = p.supplierObservation
  const observed = utc(observation?.observedAt)
  if (!observation || observation.trusted !== true || !nonempty(observation.evidenceId) || observed === null) {
    result.push(issue('SUPPLIER_OBSERVATION_UNVERIFIED'))
  } else {
    if ((evaluated !== null && observed > evaluated) || (received !== null && observed > received)) result.push(issue('SUPPLIER_OBSERVATION_IN_FUTURE'))
    // At the expiry boundary the observation has expired.
    if (evaluated !== null && ageValid && evaluated - observed >= options.maxObservationAgeMs) result.push(issue('SUPPLIER_OBSERVATION_EXPIRED'))
  }
  if (p.rowGrain?.status !== 'approved_unique_sellable_unit' || !nonempty(p.rowGrain.evidenceId)) result.push(issue('SUPPLIER_ROW_GRAIN_UNCONFIRMED'))
  return result
}

function interpretRow(row: FeedRow): void {
  const fields = row.fields
  if (!fields) return
  const code = fields.ProductCode
  if (!nonempty(code)) row.issues.push(issue('PRODUCT_CODE_MISSING', 'ProductCode'))
  else if (code !== code.trim() || /[\x00-\x1f\x7f]/.test(code)) row.issues.push(issue('PRODUCT_CODE_INVALID', 'ProductCode'))
  for (const key of ['TranslationName', 'Brand', 'Size'] as const) if (!nonempty(fields[key])) row.issues.push(issue('REQUIRED_LABEL_FIELD_MISSING', key))
  const price = parseWholesalePence(fields.ProductPrice)
  if (price.issue) row.issues.push(issue(price.issue, 'ProductPrice'))
  let stock: number | null = null
  if (!/^-?(?:0|[1-9]\d*)$/.test(fields.StockLevel)) row.issues.push(issue('STOCK_INVALID_INTEGER', 'StockLevel'))
  else if (fields.StockLevel.length > 10 || !Number.isSafeInteger(Number(fields.StockLevel)) || Math.abs(Number(fields.StockLevel)) > 1_000_000_000) row.issues.push(issue('STOCK_OVERFLOW', 'StockLevel'))
  else {
    stock = Number(fields.StockLevel)
    if (stock < 0 || Object.is(stock, -0)) row.issues.push(issue('STOCK_NEGATIVE', 'StockLevel'))
  }
  if (fields.Tax !== 'VAT' && fields.Tax !== 'Zero') row.issues.push(issue('SUPPLIER_TAX_FLAG_UNKNOWN', 'Tax'))
  const barcodeStatus = fields.Barcode === '' ? 'missing' : gtin(fields.Barcode) ? 'valid_gtin' : 'unverified'
  if (barcodeStatus !== 'valid_gtin') row.issues.push(issue(barcodeStatus === 'missing' ? 'BARCODE_MISSING' : 'BARCODE_UNVERIFIED', 'Barcode'))
  row.observations = {
    productCode: nonempty(code) ? code : null, wholesaleQuotePence: price.pence, quoteCurrency: 'GBP', quoteUnit: 'unresolved_supplier_size', stockLevel: stock,
    barcode: { raw: fields.Barcode, status: barcodeStatus, normalized: null },
    taxBasisApproved: false, billableQuantity: null, scientificFields: null,
  }
}

/** Strict local evidence transformation. Does not fetch URLs, infer pack units or approve any data. */
export function planSupplierFeed(raw: Uint8Array, options: FeedOptions): FeedSnapshot {
  if (!(raw instanceof Uint8Array)) throw new TypeError('Feed input must be UTF-8 bytes.')
  if (!options || typeof options !== 'object') throw new TypeError('Feed evaluation metadata must be an object.')
  const issues = checkProvenance(options)
  const rows: FeedRow[] = []
  let header: string[] | null = null, headerValid = false, complete = true
  let parserFailure: FeedSnapshot['accounting']['parserFailure'] = null
  const failure = (code: string, parserLine: number | null = null): void => {
    complete = false; parserFailure = { code, parserLine }; issues.push(issue(code))
  }
  if (raw.byteLength > FEED_LIMITS.bytes) failure('SNAPSHOT_TOO_LARGE')
  else {
    let text: string | null = null
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw) }
    catch { failure('SNAPSHOT_INVALID_UTF8') }
    if (text !== null) {
      try {
        parse(text, {
          bom: true, columns: false, cast: false, trim: false,
          skip_empty_lines: false, skip_records_with_error: false,
          // Retain bad-width records as evidence; they make the whole snapshot HOLD below.
          relax_column_count: true, relax_quotes: false,
          raw: true, info: true, max_record_size: FEED_LIMITS.recordCharacters,
          on_record(value: unknown) {
            // csv-parse types do not currently model the info/raw wrapper when columns=false.
            const entry = value as { record: string[]; raw: string; info: { lines: number } }
            if (header === null) {
              header = entry.record
              headerValid = header.length === FEED_HEADER.length && header.every((value, index) => value === FEED_HEADER[index])
              if (!headerValid) issues.push(issue('SNAPSHOT_HEADER_MISMATCH'))
            } else {
              if (rows.length >= FEED_LIMITS.rows) throw Object.assign(new Error('Row limit'), { code: 'SNAPSHOT_ROW_LIMIT', lines: entry.info.lines })
              const correctWidth = entry.record.length === FEED_HEADER.length
              const row: FeedRow = {
                recordNumber: rows.length + 1, parserEndLine: entry.info.lines, fieldsSha256: hash(JSON.stringify(entry.record)), rawFields: entry.record,
                claimedProductCode: headerValid && nonempty(entry.record[0]) ? entry.record[0] : null,
                fields: headerValid && correctWidth ? Object.fromEntries(FEED_HEADER.map((key, index) => [key, entry.record[index]])) as RawFeedFields : null,
                issues: correctWidth ? [] : [issue('ROW_COLUMN_COUNT_MISMATCH')], observations: null,
              }
              if (!headerValid) row.issues.push(issue('ROW_HEADER_UNUSABLE'))
              interpretRow(row); rows.push(row)
            }
            return null // Retained in rows; do not allocate a second copy in the parser result.
          },
        })
      } catch (error) {
        const detail = error as { code?: string; lines?: number }
        // Do not copy parser messages/records into summaries: those can contain supplier data.
        failure('SNAPSHOT_CSV_PARSE_ERROR', Number.isSafeInteger(detail.lines) ? detail.lines! : null)
        parserFailure!.code = typeof detail.code === 'string' ? detail.code : 'CSV_UNKNOWN_ERROR'
      }
    }
  }
  if (header === null) issues.push(issue('SNAPSHOT_HEADER_MISSING'))
  if (rows.length === 0 && complete) issues.push(issue('SNAPSHOT_NO_DATA'))
  if (rows.some(row => row.rawFields.length !== FEED_HEADER.length)) issues.push(issue('SNAPSHOT_COLUMN_COUNT_MISMATCH'))

  const groups = new Map<string, FeedRow[]>()
  for (const row of rows) {
    const code = row.claimedProductCode
    if (code) {
      const group = groups.get(code)
      if (group) group.push(row)
      else groups.set(code, [row])
    }
  }
  // Detect possible identity collisions without rewriting the supplier identifier.
  const folded = new Map<string, string[]>()
  for (const code of groups.keys()) {
    const key = code.trim().toLowerCase(), group = folded.get(key)
    if (group) group.push(code)
    else folded.set(key, [code])
  }
  for (const codes of folded.values()) if (codes.length > 1) for (const code of codes) for (const row of groups.get(code)!) row.issues.push(issue('PRODUCT_CODE_NORMALIZATION_COLLISION'))
  let duplicateGroups = 0, duplicateRows = 0
  for (const group of groups.values()) if (group.length > 1) {
    duplicateGroups++; duplicateRows += group.length
    for (const row of group) row.issues.push(issue('DUPLICATE_PRODUCT_CODE_AMBIGUOUS'))
  }
  const counts: Record<string, number> = {}
  for (const row of rows) for (const code of new Set(row.issues.map(value => value.code))) counts[code] = (counts[code] ?? 0) + 1
  const candidates: DraftCandidate[] = [...groups.entries()].map(([code, group]) => {
    const candidateIssues = [...issues, ...group.flatMap(row => row.issues)]
    return {
      action: 'DRAFT_CANDIDATE_ONLY', supplierProductCode: code, recordNumbers: group.map(row => row.recordNumber),
      selectedRecordNumber: candidateIssues.length === 0 && group.length === 1 ? group[0].recordNumber : null,
      status: candidateIssues.length > 0 ? 'HOLD' : 'REVIEW_REQUIRED',
      issues: [...new Map(candidateIssues.map(value => [value.code + ':' + (value.field ?? ''), value])).values()],
      approved: false, sellable: false, priceWriteAllowed: false, mapping: null, costApproval: null, formulaApproval: null,
    }
  })
  return {
    schemaVersion: 'tll-supplier-feed/v1', writesEnabled: false,
    ingestionStatus: issues.length > 0 || rows.some(row => row.issues.length > 0) ? 'HOLD' : 'READY_FOR_REVIEW',
    provenance: structuredClone(options.provenance), evaluatedAt: options.evaluatedAt, maxObservationAgeMs: options.maxObservationAgeMs,
    rawSha256: hash(raw), rawBytes: raw.byteLength, issues, header,
    accounting: {
      complete, totalDataRecords: complete ? rows.length : null, parsedDataRecords: rows.length,
      validWidthRecords: rows.filter(row => row.rawFields.length === FEED_HEADER.length).length,
      invalidWidthRecords: rows.filter(row => row.rawFields.length !== FEED_HEADER.length).length,
      recordsWithIssues: rows.filter(row => row.issues.length > 0).length,
      unassignedRecords: rows.filter(row => !row.claimedProductCode).length,
      duplicateCodeGroups: duplicateGroups, recordsInDuplicateGroups: duplicateRows, uniqueProductCodes: groups.size,
      issueRecordCounts: counts, parserFailure,
    },
    rows, candidates,
  }
}

/** Safe aggregate output: no product codes, names, quotes, barcodes, nutrition or raw parser errors. */
export function summarizeFeed(snapshot: FeedSnapshot) {
  return {
    schemaVersion: snapshot.schemaVersion, writesEnabled: snapshot.writesEnabled,
    ingestionStatus: snapshot.ingestionStatus, provenance: snapshot.provenance,
    evaluatedAt: snapshot.evaluatedAt, maxObservationAgeMs: snapshot.maxObservationAgeMs,
    rawSha256: snapshot.rawSha256, rawBytes: snapshot.rawBytes, issues: snapshot.issues,
    accounting: snapshot.accounting,
    draftCandidates: snapshot.candidates.length,
    candidatesOnHold: snapshot.candidates.filter(candidate => candidate.status === 'HOLD').length,
    candidatesRequiringReview: snapshot.candidates.filter(candidate => candidate.status === 'REVIEW_REQUIRED').length,
  }
}
