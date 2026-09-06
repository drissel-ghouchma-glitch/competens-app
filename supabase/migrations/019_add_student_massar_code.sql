-- Store the official Massar identifier supplied by the Ministry export.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS massar_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_massar_code_unique
  ON public.students (massar_code)
  WHERE massar_code IS NOT NULL AND trim(massar_code) <> '';
