BEGIN;

-- 1. Add period column: 'morning' | 'afternoon'
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'morning'
    CHECK (period IN ('morning', 'afternoon'));

-- 2. Add admin confirmation flag
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS is_confirmed_by_admin boolean NOT NULL DEFAULT false;

-- 3. Drop the old (student_id, date) unique constraint
ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_student_id_date_key;

-- 4. New composite unique: one record per student / date / period
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_student_id_date_period_key
    UNIQUE (student_id, date, period);

-- 5. Index to speed up admin-confirmation filter used by parent queries
CREATE INDEX IF NOT EXISTS idx_attendance_confirmed
  ON public.attendance (student_id, date, is_confirmed_by_admin);

COMMIT;
