# Lifting Lab — Site Accuracy Audit

Standing project (started 2026-08-18). Goal: zero missing information; every statement factually correct, clear, easy to understand. Feature-building paused until Toby lifts it.

Legend — Status: 🔴 open · 🟡 fixing · ✅ done · ⏸️ Toby decision
Severity: HIGH (wrong/unsafe) · MED · LOW (wording/consistency)

---

## Phase 1 — Content fact-check (data layer) — DONE 2026-08-18

Verified against evidence (ISSN position stands, EFSA, NHS/SACN, examine.com). Overall: content is unusually accurate. No HIGH clinical errors in claims; two HIGH items are a wrong reference number and a buried safety caveat.

### HIGH
| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| H1 | lib/nutrient-limits.ts (selenium) | UL = 300 mcg is the outdated 2000 SCF value | EFSA 2023 lowered UL to **255 mcg/day** | ✅ |
| H2 | lib/side-effects.ts + lib/dosage.ts (ashwagandha) | Pregnancy buried as soft caveat; no liver-symptom referral; thyroid/autoimmune/hormone-sensitive flags absent at item level | Elevate pregnancy to explicit contraindication; add "stop + see doctor if jaundice/dark urine/abdo pain"; add thyroid/autoimmune/hormone-sensitive-cancer avoid flags | ✅ |

### MED
| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| M1 | lib/dosage.ts + lib/ingredients.ts + guides.ts + calc citrulline (context) | Internally inconsistent pure-vs-malate figures; pure target (3–6g) below the 6–8g used in positive trials | Standardised on **6–8g pure / 9–12g malate** across all files | ✅ |
| M2 | lib/side-effects.ts (omega-3) | High-dose AF (atrial fibrillation) signal not mentioned | Added line re ~4g/day AF risk | ✅ |
| M3 | lib/side-effects.ts (melatonin) | "interacts with several medications" too vague | Named classes: anticoagulants, anticonvulsants, immunosuppressants, sedatives | ✅ |
| M4 | dosage.ts + side-effects.ts + combos.ts + calc page/component | "4–6g (~65mg/kg)" vs ISSN 3.2–6.4g — was inconsistent across 6 sites | Standardised on **3.2–6.4 g/day** everywhere; dropped mg/kg framing; calc clamp floor 4→3.2, cap 6→6.4 | ✅ |
| M5 | lib/myths.ts (creatine hair loss) | "no study since has replicated even the DHT change" overstated | Reworded: "not confirmed by later studies, most of which did not re-measure DHT" | ✅ |
| M6 | app/calculators/protein (ProteinCalculator.tsx) | "Best per-meal minimum" mislabels the 0.4g/kg MPS optimum as a minimum | Relabelled "Optimal per-meal dose (for muscle)" | ✅ |

**Council sign-off (Phase 1 fixes):** medical-accuracy ✅ PASS (9/9 facts confirmed), editorial-clarity ✅ PASS, completeness/consistency — initial FAIL (caught beta-alanine 4–6g stragglers across 6 files + guides.ts citrulline 3–4g) → fixed → re-vote pending. Build ✅ green (126 pages). Pre-existing lint errors logged to Phase 2.

**Applied LOW fixes:** L2 DHEA (UK POM), L3 PT-141 (not UK-licensed). Remaining LOW open: L1 (vitC/iron UL labelling), L4 (testosterone H1 "boost"), L5 (caffeine half-life 5 vs 5–6h), L6 (body-fat ACE bands), L7 (citation date confirm).

### LOW
| # | Item | Issue | Status |
|---|------|-------|--------|
| L1 | nutrient-limits.ts vit C / iron | Labelled "UL" but are EFSA "safe levels" (no formal UL) | 🔴 |
| L2 | testosterone.ts (DHEA) | "not sold OTC" understates — it's a UK prescription-only medicine | 🔴 |
| L3 | peptides.ts (PT-141) | "licensed in US... UK prescription territory" — not UK-licensed at all | 🔴 |
| L4 | testosterone page H1 | "Boost Your Testosterone" vs honest "you can't boost normal levels" body | 🔴 |
| L5 | caffeine half-life | 5h (calc) vs 5–6h (timing) inconsistency | 🔴 |
| L6 | body-fat calc | ACE band edges shifted ~1pt from published (13/17 vs 14/18) | 🔴 |
| L7 | guide-citations.ts | Ho CY et al. dated 2026 — confirm citation is real | 🔴 |

### Verified correct (no action)
- Calculators: BMI, TDEE, Plate, DOTS, RPE, Creatine, Citrulline (formula), Body-fat (Navy formula), Timing, 1RM formulas, Beta-alanine split.
- Dosage: 24/24 doses/timings/forms/ceilings sound; evidence tiers defensible.
- Ingredients: 15/15 claims + evidence labels honest.
- Safety: side-effects/watch-outs/myths largely sound; strong disclaimers.
- TRT/peptides: no unproven claim stated as fact; no dosing/sourcing for Rx/research compounds; WADA/legality disclosures present.
- Reference: all 12 UK RNI values correct; ULs correct except selenium; glossary 26 terms correct; sleep + guides dosing correct.

---

## Phase 2 — UI / flows / buttons / rendering — TODO
Every page's copy, links, CTAs, buttons, forms, nav, empty states, error states. Check: dead links, broken CTAs, mislabelled buttons, unclear microcopy, mobile layout claims. Pages: home, products, compare, vs/[matchup], best/[category], brand, alternatives, deals, cheapest, value, protein-value, leaderboard, rewards, dashboard, account, auth, submit, contact, forms, faq page, methodology, glossary page, wizard, stack/stacks, combine, strongest-pre-workout.

## Phase 3 — Data-layer accuracy — TODO
Product prices, servings_per_container, cost-per-serving maths, scoring algorithm correctness, affiliate links resolve, category assignments. (Some depends on Supabase data — hand SQL to Toby.)

## Phase 4 — Cross-cutting — TODO
Internal links resolve, sitemap matches routes, structured-data/JSON-LD correctness, methodology page matches actual scoring code.
