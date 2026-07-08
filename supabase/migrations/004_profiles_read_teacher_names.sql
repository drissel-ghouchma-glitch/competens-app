-- ============================================================
-- Migration 004: Let non-admin users resolve teacher names
-- Previously only admins/directeurs and the profile owner could
-- read rows in public.profiles. Any join to profiles(full_name)
-- from teacher_class_assignments / evaluations (e.g. the parent
-- and student-detail "per-teacher breakdown" views) silently
-- returned null for parents and teachers, so the UI fell back to
-- displaying the raw teacher_id UUID instead of the teacher's name.
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

BEGIN;

CREATE POLICY "profiles: active users read teacher names"
  ON public.profiles
  FOR SELECT
  USING (
    public.current_user_status() = 'active'
    AND role = 'professeur'
  );

COMMIT;
