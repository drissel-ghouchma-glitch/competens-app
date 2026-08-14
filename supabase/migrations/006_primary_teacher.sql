-- Assign one principal teacher to each class.
-- Run this migration in the Supabase SQL editor before deploying the UI.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS teacher_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_principal_teacher
  ON public.classes(teacher_id)
  WHERE teacher_id IS NOT NULL;

-- Existing "classes: admin write" policies normally cover this update.
-- This explicit policy supports projects whose earlier policy was omitted.
DROP POLICY IF EXISTS "classes: admin manage principal teacher" ON public.classes;
CREATE POLICY "classes: admin manage principal teacher"
  ON public.classes
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

