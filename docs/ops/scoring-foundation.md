# Scoring data foundation — S01/S02/S03/S05/S07/S09

This module prepares validated inputs and attributed review records for a replacement evidence system. It is **not a scientific scoring model, an evidence adjudication, a safety calculator or a publication service**. No existing category rules, public scores, product rows, claims or recommendations are changed. Every formula and assessment result remains `publishable: false`.

The completed scoring audit and implementation plan identify the underlying defects: favourable defaults for empty inputs, discarded units, unequal treatment of equivalent amounts, commercial factors inside scientific scores, unsupported percentage precision, and brand/name aliases detached from formula identity. The work below implements foundation-level controls for those findings; it does not close their UI, clinical review or production acceptance requirements.

## Contracts and trust boundary

`lib/scoring-foundation.ts` is a pure Node module using only the built-in SHA-256 implementation. It performs no file, network, database or clock reads. Callers supply a UTC epoch-millisecond evaluation time. All results are JSON serializable and do not mutate inputs.

`EvidenceField<T>` has exactly three evidence states:

- `verified`: a supplied value with references to the captured source records supporting the transcription.
- `missing`: a reason and no value. An omitted amount, unrecorded allergen list or absent warning field is not zero or an empty list.
- `invalid`: a reason and no usable value. Negative quantities, conflicting dual units, malformed references and ambiguous text require correction.

A validator result of `valid` means the contract and recorded lineage passed its checks. It does **not** prove that a caller read a label correctly, that a source hash matches actual downloaded bytes, that the named reviewers are authorised, or that a scientific interpretation is true. In production, source capture, review identity and approved versions must come from authenticated, authorised services and immutable evidence storage. Never expose these functions as a public “approve my product” endpoint or interpret `valid` as `publishable`.

An exact formula binds product, variant, formula version, flavour, label/source version and content hash, source locator and date, distinct transcriber and reviewer, serving and daily directions, ingredient identities/forms, standardisation text, explicit mass ratios, amount kind and basis, declared quantities, blend disclosure, allergens, warnings and component relationships. The canonical hash includes these fields and the conversion schema/version. Reordering object keys, ingredient rows or source records does not change identity. Changing label provenance, serving instructions, formula details or a warning does. Price, commission, brand marketing and ownership are not formula inputs.

`standardisation` retains the source's exact reviewed statement; no numeric efficacy credit is extracted from it. `ratio.kind: not_stated` records the checked absence of a ratio on that source and never supplies a default fraction. Unsupported ratio bases stay held. Compound, elemental, active, total and unspecified amounts remain distinct. Component links cannot reference missing rows, themselves or a cycle. The module does not sum these rows or infer an active amount from a compound name.

## Units and arithmetic

`normalizeQuantity` accepts a separate decimal string and explicit unit. Comma groups must be complete UK-style thousands groups, so `1,000` is accepted and `1,00` is rejected. Exponents, ranges, fractions, unit-containing values, ratio text, form names and multiple-number labels are not heuristically parsed. `MK-4` belongs in the form field, never the amount field. Numeric JavaScript values are rejected at this boundary so ingestion cannot silently lose grouping, precision or zero/missing distinctions.

The initial canonical dimensions are mass (`mg`), volume (`ml`), count (with an explicit count identity), and activity (`IU` or `CFU` with an explicit substance/strain identity). Exact reduced rational arithmetic preserves non-terminating mass fractions and avoids floating-point rounding during normalization. Decimal input is bounded to 48 characters and nine fractional places; longer or unsupported representations require an explicit ingestion decision.

Mass prefixes follow the [BIPM SI prefix definitions](https://www.bipm.org/en/measurement-units/si-prefixes). The only ingredient-specific activity-to-mass conversion is for explicitly identified vitamin D2 or D3: the [NIH Office of Dietary Supplements reference](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/) states that 1 microgram vitamin D equals 40 IU. Thus 50 micrograms, 0.05 mg and 2,000 IU normalize to the same amount. This conversion does not apply to other vitamins, calcifediol, blood concentrations or an unspecified “vitamin D” identity. These sources were checked on 15 September 2026; no intake target, upper limit or efficacy threshold is introduced.

`normalizeDeclaredDose` requires one primary declaration and an explicit list of equivalent declarations. Each must agree in canonical dimension, identity and amount. A dual-unit label describes one dose and is not added twice. The primary display value/unit are retained, while the archived source and its content hash preserve the full original label.

`scaleQuantity` requires a known quantity and an explicit nonnegative decimal multiplier. Zero servings contributes exactly zero when the underlying amount is known. Zero does not hide an unknown or invalid amount. A formula's physical serving size must be positive; an explicit zero daily multiplier remains zero.

`deriveMassFraction` requires a compound amount, a separately verified mass ratio, matching compound identity, distinct constituent identity and source references. The result carries the derivation lineage. A verified 1:1 mass ratio differs from 2:1; neither is inferred from “malate”. Molar ratios are rejected, and a quantity already declared elemental cannot be multiplied again through this operation. This is mass-fraction arithmetic, not a claim that a commercial compound has a particular composition or bioavailability.

## Review records, value and legacy migration

`evidenceManifest` binds source IDs, versions, content hashes, locators and capture dates to an evidence revision. `validateAssessment` recomputes current formula and evidence hashes, requires the current model version, and rejects expired, future or chronologically impossible reviews. It records an outcome/population/intervention/comparator/duration, rationale, limitations, funding, reviewer, review dates, a categorical evidence result, categorical confidence and a separate formula match. An unassessed record cannot have a favourable evidence category, and incomplete/unspecified formula data cannot be called a full match.

The initial categorical vocabulary is a contract for attributed human review, **not an automatically assigned GRADE judgement**: evidence may be `established_in_context`, `promising_or_mixed` or `insufficient`; confidence may be `high`, `moderate`, `low`, `very_low` or `not_assessed`; formula match is separate. The validator does not select any of these values. It rejects percentage scores, price, commission, brand bonuses and other extra assessment fields. Even a structurally complete record is returned as `unpublished_review_record`, never as an efficacy or safety verdict.

`commercialValue` is an independent arithmetic view of an explicitly supplied GBP pack-price observation and verified serving count. It requires an exact variant reference, source reference and observation/expiry times, rejects missing/nonpositive price or serving count, and returns a rational pence-per-serving amount. It does not validate commercial approval, verify the referenced source externally, include delivery or checkout adjustments, or certify that a price still applies. The approved catalogue/price pipeline must supply those facts before any future public value projection. In particular, the user's per-item delivery cost remains the responsibility of that pricing pipeline and is not folded into scientific evidence.

`adaptLegacyScores` accepts the frozen table explicitly and returns exact historical lookup keys and valid legacy numbers only as `legacy_unverified` records. It does not resolve aliases, manufacture formula IDs or assign new grades. Missing and malformed legacy numbers remain marked as such, including a recorded numerical zero being distinct from missing. The result records a caller-supplied snapshot version/source path and a hash of the normalized quarantine records; that `recordsHash` is not a hash of the original source file. Preserve the original frozen source under its Git revision for historical reconstruction. The adapter does not import or run the old generator or depend on the missing external dataset.

## Integration sequence and remaining gates

1. Review these contracts and synthetic tests independently. Add authenticated source capture and immutable raw-label storage, then an ingestion/review queue that retains all missing/invalid issues. No automated transcription becomes “verified” without the label review workflow.
2. Reconcile every existing exact formula/variant, including missing nutrient rows, serving ambiguities, flavours and revised labels. Run the legacy adapter into a separate internal history collection. Keep historical scores out of fallback endorsements; do not silently replace current UI rules in this foundation change.
3. Have the research and safety reviewers define the missing category-specific requirements, evidence questions and approved interpretation rules. Complete S04/S06/S08 and category reviews, including source-level risk of bias, applicability, adverse events, protocol details, qualifications, claims approval and methodology generation. The present source manifest is not that completed evidence register.
4. Build a reviewed canonical input adapter for evidence, colour and safety consumers. Add population-specific references and a duplicate-aware safety aggregator; unsupported units, missing strains/actives, vulnerable populations and incomplete stacks must remain unresolved rather than “safe”. Test compounds/constituents and total/component relationships before enabling aggregation.
5. Persist approved formula/evidence/model versions and build one authorised assessment projection for TLL, shop, saved stacks, emails and agent API. Validate current lineage on every read. Changed formula, label, serving, evidence or model must withhold the old projection. Add reviewer authorisation, revoke/hold handling and publication approval outside this pure module.
6. Roll out one independently reviewed category at a time with replayable product fixtures, versioned methodology and rollback. Replace universal percentage displays coherently across surfaces; keep commercial value independent. Until then, no production scientific score is certified by this foundation.

## Verification

Run `node --experimental-strip-types --test tests/scoring-foundation.test.mjs`, then `npm test`, `npm run typecheck` and `npm run lint` with the repository's pinned dependencies. Fixtures are synthetic except the read-only migration test of the existing frozen score table. No raw labels, private audit files, supplier data, customer records, secrets or new product scores are copied into the public repository. No hosted calls or writes are required.
