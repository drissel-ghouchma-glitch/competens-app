-- ============================================================
-- Migration 005: Célébration de réussite — publish/hide flag
-- Adds a singleton `system_settings` row holding
-- `is_celebration_published`. When true, the honor-roll data
-- (students, classes, evaluations) becomes readable by every
-- active user (parents, teachers) instead of only admins/
-- directeurs — otherwise a parent/teacher-facing celebration
-- view can't compute the same cross-teacher global average the
-- admin sees. When false, RLS falls back to the existing
-- narrower per-role policies.
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id                         int PRIMARY KEY DEFAULT 1,
  is_celebration_published   boolean NOT NULL DEFAULT false,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_singleton CHECK (id = 1)
);

INSERT INTO public.system_settings (id, is_celebration_published)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings: active users read"
  ON public.system_settings
  FOR SELECT
  USING (public.current_user_status() = 'active');

CREATE POLICY "system_settings: admin write"
  ON public.system_settings
  FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── Additive read policies, gated on the publish flag ─────────
-- These OR with the existing narrower policies (admin/directeur,
-- teacher-own, parent-own) — they only ever widen access, and
-- only while the celebration is published school-wide.

CREATE POLICY "students: read when celebration published"
  ON public.students
  FOR SELECT
  USING (
    public.current_user_status() = 'active'
    AND EXISTS (
      SELECT 1 FROM public.system_settings
      WHERE id = 1 AND is_celebration_published = true
    )
  );

CREATE POLICY "classes: read when celebration published"
  ON public.classes
  FOR SELECT
  USING (
    public.current_user_status() = 'active'
    AND EXISTS (
      SELECT 1 FROM public.system_settings
      WHERE id = 1 AND is_celebration_published = true
    )
  );

CREATE POLICY "evaluations: read when celebration published"
  ON public.evaluations
  FOR SELECT
  USING (
    public.current_user_status() = 'active'
    AND EXISTS (
      SELECT 1 FROM public.system_settings
      WHERE id = 1 AND is_celebration_published = true
    )
  );

COMMIT;
