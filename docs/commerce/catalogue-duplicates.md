# Catalogue duplicates: awaiting Toby (13 Oct 2026)

Decision: one page per product with a flavour/size dropdown; per-flavour pages are deleted, not redirected.

FACT: no per-flavour routes exist in code (`/products/[id]` is the only product route). The live catalogue (`/api/products`, 176 rows) has no per-flavour duplicate rows. Three brand+name duplicate groups exist, all live and listed in the production sitemap; they differ by pack size or by a data error, not flavour. Nothing is deleted or merged until Toby decides whether each keeps a redirect.

| Group | Rows (id: detail) | Likely action |
| --- | --- | --- |
| Warrior Crunch Bar (White Chocolate Crisp) | 1fab2546-6a25-4fd9-8e49-abf6bb6b362c: 12 x 64 g, £23.99; 8ddfc493-0872-4235-ba25-5091ef172b49: single bar, £2.00 | Merge as size options under 1fab2546 |
| Warrior Whey Protein | e94b13c4-f7fa-42d2-94b2-8dfcda316311: 40 servings, £29.99; b9058eef-f71a-49f7-9672-a264d1a09614: 16 servings, £19.99 | Merge as size options under e94b13c4 |
| Strom EssentialMax | 2567a955-be92-4f70-b147-f908fa80650c: eaas, 13 g; 60cbe489-96a8-416e-a11b-243e3277caf3: intra-workout, 15 g | Same Shopify product; true duplicate with conflicting data. Keep one after label check |

Merge procedure (not run): point the child's variant mapping rows (`tll_mapping_private.product_mapping.comparison_product_id`) at the parent; move reviews/nutrients if needed; then set the child `products.status` to inactive/delete it so it leaves the catalogue, sitemap and routes.
