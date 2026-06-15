-- reseed-04-optional-hide-unscoreable.sql  (OPTIONAL — requires Toby approval)
-- These 10 active products have NO Path A data.js entry, so they cannot be
-- clinically scored without guessing (against the standing no-guess rule). They
-- currently render a blank score. Running this hides them (status=inactive, allowed
-- by products_status_check) until real data is added. DO NOT run unless you want them hidden.
-- Reversible: SET status = 'active' WHERE id = ...
BEGIN;
UPDATE public.products SET status = 'inactive' WHERE id = '6796ca45-f01a-4573-a1cb-4e16e4dc2fa9'; -- Bulk | ZMA Zinc Magnesium
UPDATE public.products SET status = 'inactive' WHERE id = '1856438d-d5cd-4151-97d5-f5cc379eab80'; -- Bulk | Omega-3 Fish Oil
UPDATE public.products SET status = 'inactive' WHERE id = '13f50539-fa84-41d7-855f-746640b61ddf'; -- Bulk | Vitamin C 1000mg
UPDATE public.products SET status = 'inactive' WHERE id = '04cd9fc1-86e5-4ceb-a5ef-7229f15ee4dc'; -- Bulk | Magnesium Bisglycinate
UPDATE public.products SET status = 'inactive' WHERE id = '228c6fa7-7775-4e0f-bffa-c229a9503c1b'; -- Bulk | Complete Multivitamin Complex
UPDATE public.products SET status = 'inactive' WHERE id = '51015a3b-46ce-4e94-8b92-1e5d75dec507'; -- Bulk | High Protein Bar
UPDATE public.products SET status = 'inactive' WHERE id = '2b640b72-29de-4998-9aa7-3adaadeca813'; -- Bulk | Protein Cookie
UPDATE public.products SET status = 'inactive' WHERE id = '2c3efc39-8ce7-4905-966c-bdaaa927cd06'; -- MyProtein | Complete Daily Multivitamin
UPDATE public.products SET status = 'inactive' WHERE id = '8a094502-214c-4d47-8011-a812f4232d19'; -- BetterYou | Vitamin D3 4000 IU Spray
UPDATE public.products SET status = 'inactive' WHERE id = '5563d361-4c1f-4ec4-a041-dcc847e12f4f'; -- Warrior | EAA Powder
COMMIT;
