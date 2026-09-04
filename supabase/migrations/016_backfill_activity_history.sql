-- ============================================================
-- Migration 016: backfill activity history from existing school data
--
-- Activity events were introduced after attendance and evaluations already
-- existed.  This one-time, idempotent backfill makes historical date filters
-- useful immediately without fabricating new notifications for old actions.
-- ============================================================

BEGIN;

-- One event per saved attendance register.
INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'attendance_registered', register_row.teacher_id, register_row.class_id, NULL, NULL,
  register_row.date,
  'backfill:attendance-register:' || register_row.teacher_id::text || ':' || register_row.class_id::text || ':' || register_row.date::text || ':' || register_row.period,
  jsonb_build_object(
    'period', register_row.period,
    'student_count', register_row.student_count,
    'absent_count', register_row.absent_count,
    'is_session', true
  ),
  register_row.created_at
FROM (
  SELECT
    teacher_id, class_id, date, period,
    count(*) AS student_count,
    count(*) FILTER (WHERE status = 'absent') AS absent_count,
    min(created_at) AS created_at
  FROM public.attendance
  WHERE teacher_id IS NOT NULL
  GROUP BY teacher_id, class_id, date, period
) AS register_row
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_events event_row
  WHERE event_row.event_type = 'attendance_registered'
    AND event_row.actor_id = register_row.teacher_id
    AND event_row.class_id = register_row.class_id
    AND event_row.student_id IS NULL
    AND event_row.event_date = register_row.date
    AND event_row.payload ->> 'period' = register_row.period
    AND coalesce(event_row.payload ->> 'is_session', 'true') = 'true'
)
ON CONFLICT (source_key) DO NOTHING;

-- Individual historical absences make student search meaningful for teachers.
INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'attendance_registered', attendance.teacher_id, attendance.class_id, attendance.student_id, NULL,
  attendance.date,
  'backfill:attendance-absence:' || attendance.id::text,
  jsonb_build_object('period', attendance.period, 'status', 'absent', 'is_session', false),
  attendance.created_at
FROM public.attendance attendance
WHERE attendance.status = 'absent'
  AND attendance.teacher_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_events event_row
    WHERE event_row.event_type = 'attendance_registered'
      AND event_row.actor_id = attendance.teacher_id
      AND event_row.class_id = attendance.class_id
      AND event_row.student_id = attendance.student_id
      AND event_row.event_date = attendance.date
      AND event_row.payload ->> 'period' = attendance.period
      AND event_row.payload ->> 'status' = 'absent'
  )
ON CONFLICT (source_key) DO NOTHING;

-- A historical evaluation session keeps the daily counters accurate.
INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'evaluation_recorded', session_row.teacher_id, session_row.class_id, NULL, session_row.competency_id,
  session_row.date,
  'backfill:evaluation-session:' || session_row.teacher_id::text || ':' || session_row.class_id::text || ':' || session_row.competency_id::text || ':' || session_row.date::text,
  jsonb_build_object('student_count', session_row.student_count, 'student_ids', session_row.student_ids, 'is_session', true),
  session_row.created_at
FROM (
  SELECT
    teacher_id, class_id, competency_id, date,
    count(*) AS student_count,
    jsonb_agg(student_id ORDER BY student_id) AS student_ids,
    min(created_at) AS created_at
  FROM public.evaluations
  WHERE teacher_id IS NOT NULL
  GROUP BY teacher_id, class_id, competency_id, date
) AS session_row
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_events event_row
  WHERE event_row.event_type = 'evaluation_recorded'
    AND event_row.actor_id = session_row.teacher_id
    AND event_row.class_id = session_row.class_id
    AND event_row.competency_id = session_row.competency_id
    AND event_row.student_id IS NULL
    AND event_row.event_date = session_row.date
    AND event_row.payload ->> 'is_session' = 'true'
)
ON CONFLICT (source_key) DO NOTHING;

-- One row per pupil allows a teacher to find exactly whom they evaluated.
INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'evaluation_recorded', evaluation.teacher_id, evaluation.class_id, evaluation.student_id, evaluation.competency_id,
  evaluation.date,
  'backfill:evaluation-penalty:' || evaluation.id::text,
  jsonb_build_object('score_delta', -1, 'is_session', false),
  evaluation.created_at
FROM public.evaluations evaluation
WHERE evaluation.teacher_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_events event_row
    WHERE event_row.event_type = 'evaluation_recorded'
      AND event_row.actor_id = evaluation.teacher_id
      AND event_row.class_id = evaluation.class_id
      AND event_row.student_id = evaluation.student_id
      AND event_row.competency_id = evaluation.competency_id
      AND event_row.event_date = evaluation.date
      AND event_row.payload ->> 'is_session' = 'false'
  )
ON CONFLICT (source_key) DO NOTHING;

-- Recovery meetings, teacher requests and risk alerts complete the existing
-- history without triggering a new recipient notification.
INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'recovery_recorded', recovery.created_by, recovery.class_id, recovery.student_id, recovery.competency_id,
  recovery.meeting_date,
  'recovery:' || recovery.id::text,
  jsonb_build_object('action_type', recovery.action_type, 'previous_score', recovery.previous_score, 'new_score', recovery.new_score),
  recovery.created_at
FROM public.skill_recovery_actions recovery
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'recovery_admin_review_requested', recovery_request.requested_by, recovery_request.class_id,
  recovery_request.student_id, recovery_request.competency_id,
  recovery_request.created_at::date,
  'recovery-request:' || recovery_request.id::text,
  jsonb_build_object('principal_reset_count', recovery_request.principal_reset_count, 'current_score', recovery_request.current_score),
  recovery_request.created_at
FROM public.skill_recovery_requests recovery_request
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'admin_request_submitted', request_row.teacher_id, NULL, NULL, NULL,
  request_row.created_at::date,
  'admin-request:' || request_row.id::text || ':submitted',
  jsonb_build_object('request_type', request_row.type, 'status', request_row.status),
  request_row.created_at
FROM public.admin_requests request_row
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'admin_request_reviewed', request_row.reviewed_by, NULL, NULL, NULL,
  coalesce(request_row.reviewed_at, request_row.created_at)::date,
  'admin-request:' || request_row.id::text || ':status:' || request_row.status,
  jsonb_build_object('request_type', request_row.type, 'status', request_row.status, 'admin_note', request_row.admin_note),
  coalesce(request_row.reviewed_at, request_row.created_at)
FROM public.admin_requests request_row
WHERE request_row.status IN ('approved', 'rejected')
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, class_id, student_id, competency_id,
  event_date, source_key, payload, created_at
)
SELECT
  'risk_alert_opened', NULL, student.class_id, alert.student_id, NULL,
  alert.date,
  'risk-alert:' || alert.id::text,
  jsonb_build_object('level', alert.level, 'cause', alert.cause),
  alert.created_at
FROM public.alerts alert
JOIN public.students student ON student.id = alert.student_id
ON CONFLICT (source_key) DO NOTHING;

COMMIT;
