BEGIN;

-- A teacher's first attendance submission for a class/date/period is final.
-- Admins and directors remain able to run their existing confirmation workflow.
--
-- UPDATE also covers INSERT ... ON CONFLICT DO UPDATE (the application's upsert).
CREATE OR REPLACE FUNCTION public.guard_teacher_attendance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'professeur' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATTENDANCE_REGISTER_LOCKED';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_teacher_attendance_update_delete ON public.attendance;
CREATE TRIGGER trg_lock_teacher_attendance_update_delete
  BEFORE UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_teacher_attendance_mutation();

-- This statement-level check permits every row in the initial bulk INSERT, but
-- rejects attempts to append missing students to an already saved register.
CREATE OR REPLACE FUNCTION public.guard_teacher_attendance_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'professeur' AND EXISTS (
    SELECT 1
    FROM (
      SELECT class_id, date, period, count(*) AS inserted_count
      FROM inserted_attendance
      GROUP BY class_id, date, period
    ) AS batch
    WHERE (
      SELECT count(*)
      FROM public.attendance AS saved
      WHERE saved.class_id = batch.class_id
        AND saved.date = batch.date
        AND saved.period = batch.period
    ) > batch.inserted_count
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATTENDANCE_REGISTER_LOCKED';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_teacher_attendance_insert ON public.attendance;
CREATE TRIGGER trg_lock_teacher_attendance_insert
  AFTER INSERT ON public.attendance
  REFERENCING NEW TABLE AS inserted_attendance
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.guard_teacher_attendance_insert();

COMMIT;
