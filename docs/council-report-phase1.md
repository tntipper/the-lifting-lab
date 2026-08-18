# Council Governance Report — Accuracy Audit Phase 1

**Site:** The Lifting Lab (theliftinglab-app)
**Stage:** Phase 1 — Content accuracy (dosing, ingredients, safety, TRT/peptide data, reference values, calculator formulas)
**Date:** 2026-08-18
**Status:** ✅ SIGNED OFF — unanimous PASS (3/3), pushed live to `main`

---

## 1. Purpose of this report
For good governance, the review council documents *how* it reached its verdict — not just the verdict — so the process is auditable and repeatable across all four audit phases. This is that record for Phase 1.

## 2. Council composition & remit
Three independent reviewers, each with a single, non-overlapping remit and the power to fail the stage:

| Reviewer | Remit | Standard applied |
|---|---|---|
| 🩺 Medical accuracy | Every dose, limit, contraindication, safety flag, mechanism | EFSA, ISSN position stands, NHS, FDA labelling |
| ✍️ Editorial clarity | Readability, plain-English, no ambiguity, consistent tone | Reads correctly to a non-expert; no run-ons/jargon traps |
| 🔗 Completeness / consistency | Same fact identical across every file; nothing missing | Zero cross-file contradiction; every claim traceable |

## 3. Process followed
1. **Scope lock** — inventoried all in-scope content (~3.7k lines of data + 14 calculators) and recorded it in the register before any edit.
2. **Independent fact-check** — each proposed change verified against a *named primary source*, line-referenced in `accuracy-audit.md`.
3. **Author fixes** — 13 corrections drafted (2 HIGH, 6 MED, 5 LOW after consolidation).
4. **Council vote round 1** — each reviewer voted PASS/FAIL against their remit only.
5. **Correction loop** — a FAIL triggers rework, then a re-vote. No stage passes on a first-draft override.
6. **Build gate** — `npm run build` must compile clean *after* the final edits, not before.
7. **Push** — only a unanimous PASS + green build authorises the push to `main`.

## 4. What the process caught (evidence it works)
- **Completeness reviewer FAILED round 1** — the author's beta-alanine fix updated the primary file but left the old "4–6g / 65mg·kg" figure in **6 other files**, and `guides.ts` had the L-citrulline pure/malate figures reversed. This is the key governance signal: the council caught an author error the author missed.
- Rework applied across all 6 files → **re-vote unanimous PASS, zero mismatches**.
- Build compiled green **twice** (126 pages).

## 5. Verdict & sign-off trail
- 🩺 Medical accuracy — **PASS** (9 fact-changes independently confirmed)
- ✍️ Editorial clarity — **PASS** (two run-on sentences tightened)
- 🔗 Completeness / consistency — **FAIL → rework → PASS**
- Build gate — **GREEN** (126 pages, ×2)
- **Overall: SIGNED OFF.** Authorised for push.

## 6. Limitations declared (honest scope)
- Phase 1 covered **content facts only** — UI, flows, buttons, links, prices, servings, scoring maths, and structured data are explicitly **out of scope here** and are booked into Phases 2–4.
- Sources are current best-available guidance as of the review date; standards bodies update, so figures carry their source + year for future re-checking.

## 7. Full detail
Line-by-line findings, sources, and sign-off log: `docs/accuracy-audit.md`.

---
*Next stage: Phase 2 — UI / flows / buttons / links across all 67 routes. Same council gate, same governance report on completion.*
