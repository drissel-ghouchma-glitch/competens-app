-- ============================================================
-- Migration 002: Penalty-Event Model
-- Each row in evaluations = one -1 penalty deduction.
-- Global score = 100 - COUNT(penalty rows for student + competency).
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

BEGIN;

-- Step 1: Add is_archived to competencies if missing
ALTER TABLE public.competencies
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Step 2: Delete rows where teacher gave full marks (acquis = 100 %, no penalty needed)
DELETE FROM public.evaluations WHERE status = 'acquis';

-- Step 3: For remaining en_cours / non_acquis rows that are duplicated on the
-- same (student + competency + teacher + class + date), keep only one row.
-- (In practice the old UI already ensured at most one row per combination.)
DELETE FROM public.evaluations
WHERE id NOT IN (
  SELECT DISTINCT ON (student_id, competency_id, teacher_id, class_id, date)
    id
  FROM public.evaluations
  ORDER BY student_id, competency_id, teacher_id, class_id, date, created_at ASC
);

-- Step 4: Drop the status column (every remaining row is a penalty event)
ALTER TABLE public.evaluations DROP COLUMN IF EXISTS status;

-- Step 5: Performance indices
CREATE INDEX IF NOT EXISTS idx_evaluations_student_comp
  ON public.evaluations(student_id, competency_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_teacher_comp_date
  ON public.evaluations(teacher_id, competency_id, date);

COMMIT;
