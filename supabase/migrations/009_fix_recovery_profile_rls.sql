-- Hotfix for databases where migration 008 was already executed before the
-- recursive actor-name profile policy was removed.
-- Run this file immediately in Supabase SQL Editor if login reports:
-- "infinite recursion detected in policy for relation profiles".

DROP POLICY IF EXISTS "profiles: active users read recovery actor names" ON public.profiles;
