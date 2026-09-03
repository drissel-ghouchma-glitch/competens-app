BEGIN;

-- Each client-generated operation identifier makes retries idempotent. A
-- retry is therefore safe even when the original request reached PostgreSQL
-- but the browser lost its response while offline.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS client_operation_id uuid;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS client_operation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_client_operation_student
  ON public.attendance (client_operation_id, student_id)
  WHERE client_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluations_client_operation_student
  ON public.evaluations (client_operation_id, student_id)
  WHERE client_operation_id IS NOT NULL;

-- The only write path for a teacher attendance register. It validates the
-- teacher and every submitted student, then either creates the whole register
-- atomically or recognises an exact retry of the same offline operation.
CREATE OR REPLACE FUNCTION public.submit_attendance_register(
  p_operation_id uuid,
  p_class_id uuid,
  p_date date,
  p_period text,
  p_records jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input_count integer;
  v_distinct_input_count integer;
  v_existing_count integer;
  v_matching_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() <> 'professeur' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_NOT_AUTHORIZED';
  END IF;
  IF p_operation_id IS NULL OR p_class_id IS NULL OR p_date IS NULL
     OR p_period NOT IN ('morning', 'afternoon')
     OR jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REGISTER_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id
      AND c.is_archived = false
      AND sy.is_closed = false
      AND (
        c.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.teacher_class_assignments tca
          WHERE tca.class_id = c.id AND tca.teacher_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_NOT_AUTHORIZED';
  END IF;

  SELECT count(*), count(DISTINCT record.student_id)
  INTO v_input_count, v_distinct_input_count
  FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text);

  IF v_input_count <> v_distinct_input_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text)
       LEFT JOIN public.students s ON s.id = record.student_id
       WHERE s.id IS NULL
          OR s.class_id IS DISTINCT FROM p_class_id
          OR s.is_archived = true
          OR record.status NOT IN ('present', 'absent')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REGISTER_INCOMPLETE';
  END IF;

  -- Serialise submissions for the same register. This prevents two devices
  -- from both creating a first register concurrently.
  PERFORM pg_advisory_xact_lock(hashtext('attendance:' || p_class_id::text || ':' || p_date::text || ':' || p_period));

  SELECT count(*) INTO v_existing_count
  FROM public.attendance
  WHERE class_id = p_class_id AND date = p_date AND period = p_period;

  IF v_existing_count > 0 THEN
    SELECT count(*) INTO v_matching_count
    FROM public.attendance
    WHERE class_id = p_class_id
      AND date = p_date
      AND period = p_period
      AND client_operation_id = p_operation_id;

    IF v_existing_count = v_input_count AND v_matching_count = v_existing_count THEN
      RETURN;
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_REGISTER_LOCKED';
  END IF;

  INSERT INTO public.attendance (
    student_id, class_id, teacher_id, date, period, status,
    is_confirmed_by_admin, client_operation_id, updated_at
  )
  SELECT record.student_id, p_class_id, auth.uid(), p_date, p_period,
         record.status, false, p_operation_id, now()
  FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text);
END;
$$;

-- Evaluation penalties are immutable events. The RPC preserves the original
-- day selected by the teacher and protects the same students from duplicate
-- submissions while allowing an exact retry after a lost connection.
CREATE OR REPLACE FUNCTION public.submit_daily_evaluation(
  p_operation_id uuid,
  p_class_id uuid,
  p_competency_id uuid,
  p_date date,
  p_student_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input_count integer;
  v_distinct_input_count integer;
  v_existing_count integer;
  v_matching_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() <> 'professeur' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVALUATION_NOT_AUTHORIZED';
  END IF;
  IF p_operation_id IS NULL OR p_class_id IS NULL OR p_competency_id IS NULL
     OR p_date IS NULL OR coalesce(cardinality(p_student_ids), 0) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVALUATION_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id
      AND c.is_archived = false
      AND sy.is_closed = false
      AND (
        c.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.teacher_class_assignments tca
          WHERE tca.class_id = c.id AND tca.teacher_id = auth.uid()
        )
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM public.competencies
    WHERE id = p_competency_id AND coalesce(is_archived, false) = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVALUATION_NOT_AUTHORIZED';
  END IF;

  SELECT count(*), count(DISTINCT requested.student_id)
  INTO v_input_count, v_distinct_input_count
  FROM unnest(p_student_ids) AS requested(student_id);

  IF v_input_count <> v_distinct_input_count OR EXISTS (
    SELECT 1
    FROM unnest(p_student_ids) AS requested(student_id)
    LEFT JOIN public.students s ON s.id = requested.student_id
    WHERE s.id IS NULL OR s.class_id IS DISTINCT FROM p_class_id OR s.is_archived = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVALUATION_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('evaluation:' || auth.uid()::text || ':' || p_class_id::text || ':' || p_competency_id::text || ':' || p_date::text));

  SELECT count(*) INTO v_existing_count
  FROM public.evaluations e
  WHERE e.teacher_id = auth.uid()
    AND e.class_id = p_class_id
    AND e.competency_id = p_competency_id
    AND e.date = p_date
    AND e.student_id = ANY(p_student_ids);

  IF v_existing_count > 0 THEN
    SELECT count(*) INTO v_matching_count
    FROM public.evaluations e
    WHERE e.teacher_id = auth.uid()
      AND e.class_id = p_class_id
      AND e.competency_id = p_competency_id
      AND e.date = p_date
      AND e.student_id = ANY(p_student_ids)
      AND e.client_operation_id = p_operation_id;

    IF v_existing_count = v_input_count AND v_matching_count = v_input_count THEN
      RETURN;
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVALUATION_ALREADY_SAVED';
  END IF;

  INSERT INTO public.evaluations (
    student_id, competency_id, teacher_id, class_id, date, client_operation_id
  )
  SELECT requested.student_id, p_competency_id, auth.uid(), p_class_id, p_date, p_operation_id
  FROM unnest(p_student_ids) AS requested(student_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_attendance_register(uuid, uuid, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_daily_evaluation(uuid, uuid, uuid, date, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_attendance_register(uuid, uuid, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_daily_evaluation(uuid, uuid, uuid, date, uuid[]) TO authenticated;

COMMIT;
