-- Seed Data for Field Workforce Platform Development

-- Note: Seed data creates initial test organizations.
-- Users must be created via Supabase Auth (auth.users) or Supabase Dashboard.

INSERT INTO public.organizations (id, name, slug, status, created_at, updated_at)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'West African Offshore Services Ltd', 'wa-offshore', 'active', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000002', 'Caledonian Heavy Equipment Rentals', 'caledonian-rentals', 'active', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
