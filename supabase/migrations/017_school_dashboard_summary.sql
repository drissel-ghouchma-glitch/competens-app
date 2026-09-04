-- ============================================================
-- Migration 017: one school-wide dashboard summary for every role
--
-- Teachers and parents must keep their row-level access to pupils limited to
-- their own classes/children.  This RPC deliberately returns aggregates only,
-- so the Dashboard can show the same school-wide numbers to every active user
-- without widening SELECT access to students, classes or evaluations.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_school_dashboard_summary()
RETURNS TABLE (
  active_year_id uuid,
  active_year_name text,
  active_year_start_date date,
  active_year_end_date date,
  total_students bigint,
  total_classes bigint,
  total_teachers bigint,
  total_evaluations bigint,
  weekly_activity jsonb,
  recent_alerts jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.school_years%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_status(), '') <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DASHBOARD_NOT_AUTHORIZED';
  END IF;

  SELECT id, name, start_date, end_date
  INTO v_year
  FROM public.school_years
  WHERE is_active = true AND is_closed = false
  LIMIT 1;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(current_date - 6, current_date, interval '1 day')::date AS event_date
  )
  SELECT
    v_year.id,
    v_year.name,
    v_year.start_date,
    v_year.end_date,
    coalesce((
      SELECT count(*)
      FROM public.students student_row
      JOIN public.classes class_row ON class_row.id = student_row.class_id
      WHERE student_row.is_archived = false
        AND class_row.is_archived = false
        AND class_row.school_year_id = v_year.id
    ), 0)::bigint,
    coalesce((
      SELECT count(*)
      FROM public.classes class_row
      WHERE class_row.is_archived = false AND class_row.school_year_id = v_year.id
    ), 0)::bigint,
    coalesce((
      SELECT count(*)
      FROM public.profiles profile_row
      WHERE profile_row.role = 'professeur' AND profile_row.status = 'active'
    ), 0)::bigint,
    coalesce((
      SELECT count(*)
      FROM public.evaluations evaluation_row
      JOIN public.classes class_row ON class_row.id = evaluation_row.class_id
      WHERE class_row.is_archived = false AND class_row.school_year_id = v_year.id
    ), 0)::bigint,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('date', day_counts.event_date, 'count', day_counts.activity_count)
        ORDER BY day_counts.event_date
      )
      FROM (
        SELECT day_row.event_date, count(evaluation_row.id)::integer AS activity_count
        FROM days day_row
        LEFT JOIN public.evaluations evaluation_row
          ON evaluation_row.date = day_row.event_date
          AND evaluation_row.class_id IN (
            SELECT class_row.id
            FROM public.classes class_row
            WHERE class_row.is_archived = false AND class_row.school_year_id = v_year.id
          )
        GROUP BY day_row.event_date
      ) AS day_counts
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('id', alert_row.id, 'level', alert_row.level, 'date', alert_row.date)
        ORDER BY alert_row.created_at DESC
      )
      FROM (
        SELECT alert_source.id, alert_source.level, alert_source.date, alert_source.created_at
        FROM public.alerts alert_source
        JOIN public.students student_row ON student_row.id = alert_source.student_id
        JOIN public.classes class_row ON class_row.id = student_row.class_id
        WHERE alert_source.resolved = false
          AND class_row.is_archived = false
          AND class_row.school_year_id = v_year.id
        ORDER BY alert_source.created_at DESC
        LIMIT 5
      ) AS alert_row
    ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_school_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_dashboard_summary() TO authenticated;

COMMIT;
