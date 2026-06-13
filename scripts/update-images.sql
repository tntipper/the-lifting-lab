-- update-images.sql
-- Product image URLs sourced from Awin feed + bulk.com scrape
-- Run in Supabase SQL Editor
-- Generated: 2026-06-13

-- Add image_url column if it doesn't exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- ── Bulk products — confirmed image URLs ──────────────────────────────────

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

-- High Protein Bar — uses Macro Munch image as closest match
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/M/M/MMUN_PBAR_CHAZ_BX12_Thumbnail_Image_b927.png'
  WHERE brand = 'Bulk' AND name = 'High Protein Bar';

-- ── Verify what was updated ───────────────────────────────────────────────
SELECT name, brand, image_url IS NOT NULL as has_image
FROM public.products
WHERE brand = 'Bulk'
ORDER BY name;
