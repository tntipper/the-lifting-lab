-- replace-discontinued-products.sql
-- Handles Bulk's product range refresh (2024-2025 discontinuations)
-- Run AFTER update-images.sql
-- Run in Supabase SQL Editor

-- ── 1. CONFIRMED IMAGE UPDATES (11 active Bulk products) ─────────────────

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/C/r/Creatine_Monohydrate_Yellow_EU_0fbf.jpg'
  WHERE brand = 'Bulk' AND name = 'Creatine Monohydrate';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/P/U/PURE_WHEY_23G_FOP_THUMBNAIL_IMAGE_c443.png'
  WHERE brand = 'Bulk' AND name = 'Pure Whey Protein';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPPS_AMAT_1c97.png'
  WHERE brand = 'Bulk' AND name = 'Aftermath';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_ELEC_0000_Thumbnail_Image_2b30.png'
  WHERE brand = 'Bulk' AND name = 'Electrolyte Powder';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_ZMA_810C_Thumbnail_Image_428f.png'
  WHERE brand = 'Bulk' AND name = 'ZMA Zinc Magnesium';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_MAGB_500T_Thumbnail_Image_df80.png'
  WHERE brand = 'Bulk' AND name = 'Magnesium Bisglycinate';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_O3SS_1000_Thumbnail_Image_31c5.png'
  WHERE brand = 'Bulk' AND name = 'Omega-3 Fish Oil';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/B/BBLE_CMVC_POWD_Thumbnail_Image_576b.png'
  WHERE brand = 'Bulk' AND name = 'Complete Multivitamin Complex';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/M/M/MMUN_PBAR_CHAZ_BX12_Thumbnail_Image_b927.png'
  WHERE brand = 'Bulk' AND name = 'Macro Munch (Chocolate Hazelnut)';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPF_HPCO_WCRA_BX12_Thumbnail_Image_843e.png'
  WHERE brand = 'Bulk' AND name = 'Protein Cookie';

UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/M/M/MMUN_PBAR_CHAZ_BX12_Thumbnail_Image_b927.png'
  WHERE brand = 'Bulk' AND name = 'High Protein Bar';

-- ── 2. REPLACE WITH CURRENT BULK EQUIVALENTS ─────────────────────────────

-- Pure Whey Isolate → Clear Whey Isolate (Bulk's current isolate product)
UPDATE public.products
  SET name = 'Clear Whey Isolate',
      image_url = 'https://www.bulk.com/media/catalog/product/C/L/CLEAR_WHEY_PDP_2000X2000_UK_3_93d7.jpg',
      retail_price = 44.99
  WHERE brand = 'Bulk' AND name = 'Pure Whey Isolate';

-- Vitamin C 1000mg → Collagen & Vitamin C (closest current Bulk Vitamin C product)
UPDATE public.products
  SET name = 'Collagen & Vitamin C Powder',
      image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_COLL_VITC_Thumbnail_Image_b569.png',
      retail_price = 19.99
  WHERE brand = 'Bulk' AND name = 'Vitamin C 1000mg';

-- ── 3. MARK GENUINELY DISCONTINUED PRODUCTS AS INACTIVE ──────────────────
-- These products no longer exist on bulk.com (confirmed 404s).
-- They are hidden from the site but preserved in the DB for data integrity.

UPDATE public.products SET status = 'inactive'
  WHERE brand = 'Bulk' AND name IN (
    'Creapure',
    'Complete EAA',
    'Complete Intra-Workout',
    'Micellar Casein',
    'CoQ10 200mg',
    'Vitamin D3 & K2',
    'Plant Sterols',
    'Milk Thistle Extract 5000mg',
    'NAC N-Acetyl Cysteine',
    'Alpha Lipoic Acid 300mg',
    'Vitamin D3 4000IU',
    'Glucosamine & Chondroitin',
    'Complete Sleep',
    'Vegan Protein Bar'
  );

-- ── 4. VERIFY ─────────────────────────────────────────────────────────────

SELECT name, status, image_url IS NOT NULL as has_image, retail_price
FROM public.products
WHERE brand = 'Bulk'
ORDER BY status, name;
