-- ============================================================
-- Migration 018: administration presence status on attendance
--
-- A teacher's original attendance status is immutable. Management may mark
-- an absent pupil as being in the administration before confirming the
-- register; this is stored separately and is the status visible to parents.
-- ============================================================

BEGIN;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS admin_presence_status text
    CHECK (admin_presence_status IS NULL OR admin_presence_status = 'in_administration'),
  ADD COLUMN IF NOT EXISTS admin_presence_reason text,
  ADD COLUMN IF NOT EXISTS admin_presence_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_presence_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_attendance_admin_presence
  ON public.attendance (student_id, date)
  WHERE admin_presence_status = 'in_administration';

CREATE OR REPLACE FUNCTION public.confirm_attendance_register_with_admin_status(
  p_class_id uuid,
  p_date date,
  p_period text,
  p_administration_students jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_count integer;
  v_input_count integer;
  v_distinct_input_count integer;
  v_event_id uuid;
  v_teacher_id uuid;
  v_absent_record record;
  v_administration_students jsonb := '[]'::jsonb;
  v_administration_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('admin', 'directeur') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_CONFIRMATION_NOT_AUTHORIZED';
  END IF;
  IF p_class_id IS NULL OR p_date IS NULL OR p_period NOT IN ('morning', 'afternoon')
     OR jsonb_typeof(coalesce(p_administration_students, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_CONFIRMATION_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id AND c.is_archived = false AND sy.is_closed = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_CONFIRMATION_NOT_AUTHORIZED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('attendance:' || p_class_id::text || ':' || p_date::text || ':' || p_period));

  SELECT count(*) INTO v_pending_count
  FROM public.attendance
  WHERE class_id = p_class_id AND date = p_date AND period = p_period AND is_confirmed_by_admin = false;
  IF v_pending_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(*), count(DISTINCT selection.student_id)
  INTO v_input_count, v_distinct_input_count
  FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
    AS selection(student_id uuid, reason text);
  IF v_input_count <> v_distinct_input_count OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
      AS selection(student_id uuid, reason text)
    LEFT JOIN public.attendance attendance_row
      ON attendance_row.student_id = selection.student_id
      AND attendance_row.class_id = p_class_id
      AND attendance_row.date = p_date
      AND attendance_row.period = p_period
      AND attendance_row.is_confirmed_by_admin = false
    WHERE attendance_row.student_id IS NULL OR attendance_row.status <> 'absent'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_ADMIN_STATUS_INVALID';
  END IF;

  SELECT
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'student_id', selection.student_id,
          'student_name', concat_ws(' ', student_row.last_name, student_row.first_name),
          'reason', nullif(left(btrim(selection.reason), 500), '')
        ))
        ORDER BY student_row.last_name, student_row.first_name
      ),
      '[]'::jsonb
    ),
    count(*)
  INTO v_administration_students, v_administration_count
  FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
    AS selection(student_id uuid, reason text)
  JOIN public.students student_row ON student_row.id = selection.student_id;

  UPDATE public.attendance attendance_row
  SET
    is_confirmed_by_admin = true,
    admin_presence_status = CASE
      WHEN attendance_row.status = 'absent' AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
          AS selection(student_id uuid, reason text)
        WHERE selection.student_id = attendance_row.student_id
      ) THEN 'in_administration'
      ELSE NULL
    END,
    admin_presence_reason = (
      SELECT nullif(left(btrim(selection.reason), 500), '')
      FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
        AS selection(student_id uuid, reason text)
      WHERE selection.student_id = attendance_row.student_id
      LIMIT 1
    ),
    admin_presence_updated_by = CASE
      WHEN attendance_row.status = 'absent' AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
          AS selection(student_id uuid, reason text)
        WHERE selection.student_id = attendance_row.student_id
      ) THEN auth.uid()
      ELSE NULL
    END,
    admin_presence_updated_at = CASE
      WHEN attendance_row.status = 'absent' AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(coalesce(p_administration_students, '[]'::jsonb))
          AS selection(student_id uuid, reason text)
        WHERE selection.student_id = attendance_row.student_id
      ) THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE attendance_row.class_id = p_class_id
    AND attendance_row.date = p_date
    AND attendance_row.period = p_period
    AND attendance_row.is_confirmed_by_admin = false;

  v_event_id := public.record_activity_event(
    'attendance_confirmed', auth.uid(), p_class_id, NULL, NULL, p_date,
    'attendance-confirm:' || p_class_id::text || ':' || p_date::text || ':' || p_period,
    jsonb_build_object(
      'attendance_date', p_date,
      'period', p_period,
      'student_count', v_pending_count,
      'in_administration_count', v_administration_count,
      'in_administration_students', v_administration_students
    )
  );
  PERFORM public.notify_activity_management(
    v_event_id, 'attendance_confirmed', 'normal', p_class_id, NULL,
    jsonb_build_object(
      'attendance_date', p_date,
      'period', p_period,
      'student_count', v_pending_count,
      'in_administration_count', v_administration_count,
      'in_administration_students', v_administration_students
    ), 'info'
  );

  FOR v_teacher_id IN
    SELECT DISTINCT teacher_id
    FROM public.attendance
    WHERE class_id = p_class_id AND date = p_date AND period = p_period AND teacher_id IS NOT NULL
  LOOP
    PERFORM public.queue_activity_notification(
      v_teacher_id, v_event_id, 'attendance_confirmed', 'normal', p_class_id, NULL,
      jsonb_build_object(
        'attendance_date', p_date,
        'period', p_period,
        'in_administration_count', v_administration_count,
        'in_administration_students', v_administration_students
      ),
      v_event_id::text || ':teacher:' || v_teacher_id::text, 'info'
    );
  END LOOP;

  FOR v_absent_record IN
    SELECT student_id, admin_presence_status, admin_presence_reason
    FROM public.attendance
    WHERE class_id = p_class_id
      AND date = p_date
      AND period = p_period
      AND status = 'absent'
  LOOP
    PERFORM public.notify_activity_parents(
      v_event_id,
      'attendance_confirmed',
      CASE WHEN v_absent_record.admin_presence_status = 'in_administration' THEN 'normal' ELSE 'high' END,
      p_class_id,
      v_absent_record.student_id,
      jsonb_strip_nulls(jsonb_build_object(
        'attendance_date', p_date,
        'period', p_period,
        'status', coalesce(v_absent_record.admin_presence_status, 'absent'),
        'administration_reason', v_absent_record.admin_presence_reason
      )),
      CASE WHEN v_absent_record.admin_presence_status = 'in_administration' THEN 'info' ELSE 'alert' END
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_attendance_register_with_admin_status(uuid, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_attendance_register_with_admin_status(uuid, date, text, jsonb) TO authenticated;

COMMIT;
