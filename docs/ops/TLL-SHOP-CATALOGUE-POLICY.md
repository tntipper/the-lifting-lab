# TLL + Shop catalogue / buy policy

**Status:** Locked  
**Date:** 2026-09-14  
**Owner:** Toby Tipper  

This document is the **normative** operating policy for The Lifting Lab (TLL) catalogue listing rules and Shop (TropShip) buy / merchandising behaviour. GitHub is the source of truth. Local audit workbooks and operational notes are non-normative.

---

## Dual surface

| Surface | Role |
| --- | --- |
| `theliftinglab.co.uk` (TLL) | Scored **Effectiveness Match** comparison site only |
| `shop.theliftinglab.co.uk` (Shopify / TropShip dropship) | Wide shop; no need to hold inventory (Tropicana ships) |

**Two funnels**

1. Direct to Shop  
2. TLL → Buy → Shop (or affiliate)

---

## TLL listing rules

1. **Effectiveness Match score ≥ 50/100** is required to list a product on TLL.
2. Cap **~30 products per category**. Fill toward 30 by, in order:
   1. Highest score  
   2. Biggest UK sellers  
   3. Known brands  
3. A famous brand under 50 stays **off TLL**; it may still appear on Shop.

---

## Buy button priority

When wiring a Buy action on TLL, resolve destinations in this order:

1. **TropShip / Shopify** when an honest in-stock TropShip match exists (**TropShip trumps affiliate**).
2. Else a **proven affiliate** (e.g. Amazon tag `theliftinglab-21`, Awin).
3. Else **blank / no buy** until wired.

Do not invent or guess scores, stock, or affiliate mappings to force a button live.

---

## Shop rules

- **No 30-cap** on Shop; it can carry a broad TropShip range.
- Prefer merchandising by:
  - Category  
  - Brand hubs  
  - Scored “best Effectiveness Match” collections (**only for scored items**)
- **Password-off** and **live charged TropShip orders** need Toby’s **named yes**.

---

## What must NOT happen

- Do **not** dump thousands of unscored TropShip SKUs onto TLL product grids.
- Do **not** invent Effectiveness Match scores. **Lifty** owns product-truth **PASS** before new TLL listings.

---

## Related artifacts (reference only — not in this repo yet)

Local audit/workbook paths are operational notes. **GitHub policy is normative.**

Do **not** commit:

- TropShip credentials  
- SFTP passwords  
- API secrets  

Store secrets in the appropriate secret manager / host env, never in docs or the repository.

---

## Change control

- Edits to this policy require Review / Toby yes before they become binding.
- Production catalogue, buy wiring, or Shop live-charge changes still need Review / Toby yes even when they follow this policy.
- Prefer updating this file in GitHub rather than relying on chat or spreadsheet memory.
