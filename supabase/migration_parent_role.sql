-- ================================================================
-- Migration: Parent Role + parent_student junction table + RLS
-- Run this in Supabase Dashboard → SQL Editor
-- ================================================================

-- ── 1. Extend role constraint in profiles ────────────────────────
-- Drop the old check constraint (if any) and add 'parent'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'directeur', 'professeur', 'parent'));

-- ── 2. parent_student junction table ────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_student (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);

-- Enable RLS
ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS: parent_student table ────────────────────────────────

-- Admins/directeurs: full CRUD
CREATE POLICY "admin_all_parent_student"
  ON public.parent_student
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'directeur')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'directeur')
    )
  );

-- Parents: read their own links only
CREATE POLICY "parent_read_own_links"
  ON public.parent_student
  FOR SELECT
  TO authenticated
  USING (parent_id = auth.uid());

-- ── 4. RLS: students — parents read their linked children ────────
-- (Run only if your students table has RLS enabled)
-- If students table already has a broad "authenticated" SELECT policy,
-- the parent policy below is additive and safe to add.

CREATE POLICY "parent_read_linked_students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    -- Existing authenticated users already have access via other policies.
    -- This specifically covers parent-only access path:
    auth.uid() IN (
      SELECT ps.parent_id
      FROM public.parent_student ps
      WHERE ps.student_id = public.students.id
    )
  );

-- ── 5. RLS: evaluations — parents read their children's evals ───
CREATE POLICY "parent_read_child_evaluations"
  ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT ps.parent_id
      FROM public.parent_student ps
      WHERE ps.student_id = public.evaluations.student_id
    )
  );

-- ── 6. RLS: alerts — parents read their children's alerts ────────
CREATE POLICY "parent_read_child_alerts"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT ps.parent_id
      FROM public.parent_student ps
      WHERE ps.student_id = public.alerts.student_id
    )
  );

-- ── 7. User management: allow admins to update any profile ───────
-- Admins need to be able to update role/status for any user.
-- Check if you already have a restrictive UPDATE policy; if so adjust it.
-- This policy lets admins UPDATE any profile row:
CREATE POLICY "admin_update_any_profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 8. Helpful index for performance ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_parent_student_parent_id  ON public.parent_student(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student_id ON public.parent_student(student_id);
