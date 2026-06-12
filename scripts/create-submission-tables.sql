-- Tables for contact form and supplement submission form
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplement_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  brand text NOT NULL,
  product_name text NOT NULL,
  url text NOT NULL,
  notes text,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Allow public inserts (forms don't require auth)
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_insert_contact" ON public.contact_submissions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "allow_public_insert_supplement" ON public.supplement_submissions
  FOR INSERT TO anon WITH CHECK (true);
