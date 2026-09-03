-- ============================================================
-- Migration 014: durable activity feed and role-scoped notifications
--
-- Events are created in PostgreSQL (including after an offline sync), not
-- by the browser. Notifications are private per recipient and point to an
-- immutable event record for audit and historical filtering.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     text NOT NULL CHECK (event_type IN (
    'attendance_registered', 'attendance_confirmed', 'evaluation_recorded',
    'recovery_recorded', 'recovery_admin_review_requested',
    'admin_request_submitted', 'admin_request_reviewed', 'risk_alert_opened'
  )),
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  class_id       uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id     uuid REFERENCES public.students(id) ON DELETE SET NULL,
  competency_id  uuid REFERENCES public.competencies(id) ON DELETE SET NULL,
  event_date     date NOT NULL DEFAULT current_date,
  source_key     text NOT NULL UNIQUE,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_date ON public.activity_events(event_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_class_date ON public.activity_events(class_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_student_date ON public.activity_events(student_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor_date ON public.activity_events(actor_id, event_date DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- The previous notifications table is retained for compatibility, but is
-- extended so every notification has a structured event and a safe dedupe key.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.activity_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe_key
  ON public.notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_event ON public.notifications(event_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Replace any manual/broad policies with private recipient access. New rows
-- are created only by the database helpers below.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', policy_row.policyname);
  END LOOP;
END $$;

CREATE POLICY "notifications: recipient read own"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_events', policy_row.policyname);
  END LOOP;
END $$;

CREATE POLICY "activity events: management read all"
  ON public.activity_events FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'directeur'));

CREATE POLICY "activity events: teacher read assigned classes"
  ON public.activity_events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND (
      actor_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.teacher_class_assignments assignment
        WHERE assignment.class_id = activity_events.class_id
          AND assignment.teacher_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.classes class_row
        WHERE class_row.id = activity_events.class_id
          AND class_row.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "activity events: parent read linked child"
  ON public.activity_events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND student_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.parent_student link
      WHERE link.parent_id = auth.uid() AND link.student_id = activity_events.student_id
    )
  );

GRANT SELECT ON public.activity_events, public.notifications TO authenticated;

-- The legacy alert list is still useful, but its original policy let every
-- active account read it. Keep it scoped consistently with the new activity
-- feed: management sees all, a teacher sees only assigned/principal classes,
-- and a parent sees only linked children.
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'alerts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.alerts', policy_row.policyname);
  END LOOP;
END $$;

CREATE POLICY "alerts: management read all"
  ON public.alerts FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'directeur'));

CREATE POLICY "alerts: management update all"
  ON public.alerts FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'directeur'))
  WITH CHECK (public.current_user_role() IN ('admin', 'directeur'));

CREATE POLICY "alerts: teacher read assigned classes"
  ON public.alerts FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND EXISTS (
      SELECT 1
      FROM public.students student_row
      JOIN public.classes class_row ON class_row.id = student_row.class_id
      WHERE student_row.id = alerts.student_id
        AND (
          class_row.teacher_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.teacher_class_assignments assignment
            WHERE assignment.class_id = class_row.id AND assignment.teacher_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "alerts: teacher update assigned classes"
  ON public.alerts FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND EXISTS (
      SELECT 1
      FROM public.students student_row
      JOIN public.classes class_row ON class_row.id = student_row.class_id
      WHERE student_row.id = alerts.student_id
        AND (
          class_row.teacher_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.teacher_class_assignments assignment
            WHERE assignment.class_id = class_row.id AND assignment.teacher_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (public.current_user_role() = 'professeur');

CREATE POLICY "alerts: parent read linked child"
  ON public.alerts FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1 FROM public.parent_student link
      WHERE link.parent_id = auth.uid() AND link.student_id = alerts.student_id
    )
  );

GRANT SELECT, UPDATE ON public.alerts TO authenticated;

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type text,
  p_actor_id uuid,
  p_class_id uuid,
  p_student_id uuid,
  p_competency_id uuid,
  p_event_date date,
  p_source_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO public.activity_events (
    event_type, actor_id, class_id, student_id, competency_id,
    event_date, source_key, payload
  ) VALUES (
    p_event_type, p_actor_id, p_class_id, p_student_id, p_competency_id,
    coalesce(p_event_date, current_date), p_source_key, coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (source_key) DO UPDATE SET source_key = EXCLUDED.source_key
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_activity_notification(
  p_user_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_priority text,
  p_class_id uuid,
  p_student_id uuid,
  p_payload jsonb,
  p_dedupe_key text,
  p_legacy_type text DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, read, type, related_id,
    event_id, event_type, priority, class_id, student_id, payload, dedupe_key
  ) VALUES (
    p_user_id, p_event_type, '', false, p_legacy_type, p_event_id,
    p_event_id, p_event_type, p_priority, p_class_id, p_student_id,
    coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_activity_management(
  p_event_id uuid,
  p_event_type text,
  p_priority text,
  p_class_id uuid,
  p_student_id uuid,
  p_payload jsonb,
  p_legacy_type text DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recipient record;
BEGIN
  FOR recipient IN
    SELECT id FROM public.profiles
    WHERE role IN ('admin', 'directeur') AND coalesce(status, 'active') = 'active'
  LOOP
    PERFORM public.queue_activity_notification(
      recipient.id, p_event_id, p_event_type, p_priority, p_class_id, p_student_id,
      p_payload, p_event_id::text || ':management:' || recipient.id::text, p_legacy_type
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_activity_parents(
  p_event_id uuid,
  p_event_type text,
  p_priority text,
  p_class_id uuid,
  p_student_id uuid,
  p_payload jsonb,
  p_legacy_type text DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recipient record;
BEGIN
  FOR recipient IN
    SELECT parent_id FROM public.parent_student WHERE student_id = p_student_id
  LOOP
    PERFORM public.queue_activity_notification(
      recipient.parent_id, p_event_id, p_event_type, p_priority, p_class_id, p_student_id,
      p_payload, p_event_id::text || ':parent:' || recipient.parent_id::text || ':' || p_student_id::text, p_legacy_type
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET read = true, read_at = coalesce(read_at, now())
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, uuid, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_activity_notification(uuid, uuid, text, text, uuid, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_activity_management(uuid, text, text, uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_activity_parents(uuid, text, text, uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

-- Request submissions and their administrative outcomes notify the requester
-- and management without relying on a browser callback.
CREATE OR REPLACE FUNCTION public.capture_admin_request_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_id := public.record_activity_event(
      'admin_request_submitted', NEW.teacher_id, NULL, NULL, NULL, NEW.created_at::date,
      'admin-request:' || NEW.id::text || ':submitted',
      jsonb_build_object('request_type', NEW.type, 'status', NEW.status)
    );
    PERFORM public.notify_activity_management(
      v_event_id, 'admin_request_submitted', 'normal', NULL, NULL,
      jsonb_build_object('request_type', NEW.type, 'teacher_id', NEW.teacher_id), 'info'
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    v_event_id := public.record_activity_event(
      'admin_request_reviewed', NEW.reviewed_by, NULL, NULL, NULL, current_date,
      'admin-request:' || NEW.id::text || ':status:' || NEW.status,
      jsonb_build_object('request_type', NEW.type, 'status', NEW.status, 'admin_note', NEW.admin_note)
    );
    PERFORM public.queue_activity_notification(
      NEW.teacher_id, v_event_id, 'admin_request_reviewed',
      CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'normal' END,
      NULL, NULL,
      jsonb_build_object('request_type', NEW.type, 'status', NEW.status, 'admin_note', NEW.admin_note),
      v_event_id::text || ':requester:' || NEW.teacher_id::text, 'info'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_request_activity ON public.admin_requests;
CREATE TRIGGER trg_admin_request_activity
  AFTER INSERT OR UPDATE OF status ON public.admin_requests
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_request_activity();

CREATE OR REPLACE FUNCTION public.capture_recovery_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event_id uuid;
BEGIN
  v_event_id := public.record_activity_event(
    'recovery_recorded', NEW.created_by, NEW.class_id, NEW.student_id, NEW.competency_id,
    NEW.meeting_date, 'recovery:' || NEW.id::text,
    jsonb_build_object('action_type', NEW.action_type, 'previous_score', NEW.previous_score, 'new_score', NEW.new_score)
  );
  PERFORM public.notify_activity_management(
    v_event_id, 'recovery_recorded', 'normal', NEW.class_id, NEW.student_id,
    jsonb_build_object('action_type', NEW.action_type, 'previous_score', NEW.previous_score, 'new_score', NEW.new_score), 'info'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_recovery_activity ON public.skill_recovery_actions;
CREATE TRIGGER trg_skill_recovery_activity
  AFTER INSERT ON public.skill_recovery_actions
  FOR EACH ROW EXECUTE FUNCTION public.capture_recovery_activity();

CREATE OR REPLACE FUNCTION public.capture_recovery_request_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event_id uuid;
BEGIN
  v_event_id := public.record_activity_event(
    'recovery_admin_review_requested', NEW.requested_by, NEW.class_id, NEW.student_id, NEW.competency_id,
    NEW.created_at::date, 'recovery-request:' || NEW.id::text,
    jsonb_build_object('principal_reset_count', NEW.principal_reset_count, 'current_score', NEW.current_score)
  );
  PERFORM public.notify_activity_management(
    v_event_id, 'recovery_admin_review_requested', 'high', NEW.class_id, NEW.student_id,
    jsonb_build_object('principal_reset_count', NEW.principal_reset_count, 'current_score', NEW.current_score), 'alert'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_recovery_request_activity ON public.skill_recovery_requests;
CREATE TRIGGER trg_skill_recovery_request_activity
  AFTER INSERT ON public.skill_recovery_requests
  FOR EACH ROW EXECUTE FUNCTION public.capture_recovery_request_activity();

-- Existing threshold alerts become structured risk events and reach both
-- management and linked parents.
CREATE OR REPLACE FUNCTION public.capture_alert_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event_id uuid;
DECLARE v_class_id uuid;
BEGIN
  SELECT class_id INTO v_class_id FROM public.students WHERE id = NEW.student_id;
  v_event_id := public.record_activity_event(
    'risk_alert_opened', NULL, v_class_id, NEW.student_id, NULL, NEW.date,
    'risk-alert:' || NEW.id::text,
    jsonb_build_object('level', NEW.level, 'cause', NEW.cause)
  );
  PERFORM public.notify_activity_management(v_event_id, 'risk_alert_opened',
    CASE WHEN NEW.level = 'critical' THEN 'critical' ELSE 'high' END,
    v_class_id, NEW.student_id, jsonb_build_object('level', NEW.level, 'cause', NEW.cause), 'alert');
  PERFORM public.notify_activity_parents(v_event_id, 'risk_alert_opened',
    CASE WHEN NEW.level = 'critical' THEN 'critical' ELSE 'high' END,
    v_class_id, NEW.student_id, jsonb_build_object('level', NEW.level, 'cause', NEW.cause), 'alert');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_activity ON public.alerts;
CREATE TRIGGER trg_alert_activity
  AFTER INSERT ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.capture_alert_activity();

-- Threshold alerts must be generated in PostgreSQL. The former browser-only
-- implementation was best-effort, was blocked by RLS for teachers and did
-- not run after an offline operation had later been synchronised.
CREATE OR REPLACE FUNCTION public.capture_evaluation_risk_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 100;
  v_event record;
  v_student_name text;
  v_competency record;
  v_level text;
  v_cause text;
BEGIN
  FOR v_event IN
    SELECT event_date, event_created_at, event_type, new_score
    FROM (
      SELECT e.date AS event_date, e.created_at AS event_created_at,
             'penalty'::text AS event_type, NULL::integer AS new_score
      FROM public.evaluations e
      WHERE e.student_id = NEW.student_id
        AND e.competency_id = NEW.competency_id
        AND e.class_id = NEW.class_id
      UNION ALL
      SELECT recovery.meeting_date, recovery.created_at, recovery.action_type,
             recovery.new_score
      FROM public.skill_recovery_actions recovery
      WHERE recovery.student_id = NEW.student_id
        AND recovery.competency_id = NEW.competency_id
        AND recovery.class_id = NEW.class_id
    ) AS ledger
    ORDER BY event_date, event_created_at
  LOOP
    IF v_event.event_type = 'penalty' THEN
      v_score := greatest(0, v_score - 1);
    ELSE
      v_score := v_event.new_score;
    END IF;
  END LOOP;

  -- Warn at the first meaningful threshold and once per day thereafter while
  -- a pupil remains in the critical range. The daily dedupe is competency
  -- specific because the competency code is embedded in the immutable cause.
  IF v_score <> 91 AND v_score > 50 THEN
    RETURN NEW;
  END IF;

  SELECT trim(concat_ws(' ', first_name, last_name)) INTO v_student_name
  FROM public.students WHERE id = NEW.student_id;
  SELECT code, title INTO v_competency FROM public.competencies WHERE id = NEW.competency_id;
  IF v_competency.code IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.alerts
    WHERE student_id = NEW.student_id
      AND date = NEW.date
      AND cause ILIKE '%' || v_competency.code || '%'
  ) THEN
    RETURN NEW;
  END IF;

  v_level := CASE WHEN v_score <= 50 THEN 'critical' ELSE 'warning' END;
  v_cause := CASE
    WHEN v_score = 91 THEN format(
      'Alerte : %s a atteint 91/100 en %s — %s (−9 points).',
      coalesce(nullif(v_student_name, ''), NEW.student_id::text), v_competency.code, v_competency.title
    )
    ELSE format(
      'Alerte critique : %s a chuté à %s/100 en %s — %s.',
      coalesce(nullif(v_student_name, ''), NEW.student_id::text), v_score, v_competency.code, v_competency.title
    )
  END;
  INSERT INTO public.alerts (student_id, level, cause, date, resolved)
  VALUES (NEW.student_id, v_level, v_cause, NEW.date, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluation_risk_alert ON public.evaluations;
CREATE TRIGGER trg_evaluation_risk_alert
  AFTER INSERT ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.capture_evaluation_risk_alert();

-- Replaces migration 012's attendance submit function so a successful submit
-- emits exactly one class-level event, including after an offline retry.
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
  v_absent_count integer;
  v_absent_student_id uuid;
  v_event_id uuid;
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
    SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id AND c.is_archived = false AND sy.is_closed = false
      AND (c.teacher_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.teacher_class_assignments tca WHERE tca.class_id = c.id AND tca.teacher_id = auth.uid()
      ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_NOT_AUTHORIZED';
  END IF;
  SELECT count(*), count(DISTINCT record.student_id)
  INTO v_input_count, v_distinct_input_count
  FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text);
  IF v_input_count <> v_distinct_input_count OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text)
    LEFT JOIN public.students s ON s.id = record.student_id
    WHERE s.id IS NULL OR s.class_id IS DISTINCT FROM p_class_id OR s.is_archived = true OR record.status NOT IN ('present', 'absent')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REGISTER_INCOMPLETE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('attendance:' || p_class_id::text || ':' || p_date::text || ':' || p_period));
  SELECT count(*) INTO v_existing_count FROM public.attendance WHERE class_id = p_class_id AND date = p_date AND period = p_period;
  IF v_existing_count > 0 THEN
    SELECT count(*) INTO v_matching_count FROM public.attendance
    WHERE class_id = p_class_id AND date = p_date AND period = p_period AND client_operation_id = p_operation_id;
    IF v_existing_count = v_input_count AND v_matching_count = v_existing_count THEN RETURN; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_REGISTER_LOCKED';
  END IF;
  INSERT INTO public.attendance (student_id, class_id, teacher_id, date, period, status, is_confirmed_by_admin, client_operation_id, updated_at)
  SELECT record.student_id, p_class_id, auth.uid(), p_date, p_period, record.status, false, p_operation_id, now()
  FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text);
  SELECT count(*) INTO v_absent_count FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text) WHERE record.status = 'absent';
  v_event_id := public.record_activity_event(
    'attendance_registered', auth.uid(), p_class_id, NULL, NULL, p_date,
    'attendance-submit:' || p_operation_id::text,
    jsonb_build_object('period', p_period, 'student_count', v_input_count, 'absent_count', v_absent_count)
  );
  PERFORM public.notify_activity_management(v_event_id, 'attendance_registered', 'normal', p_class_id, NULL,
    jsonb_build_object('period', p_period, 'student_count', v_input_count, 'absent_count', v_absent_count), 'info');
  FOR v_absent_student_id IN
    SELECT record.student_id
    FROM jsonb_to_recordset(p_records) AS record(student_id uuid, status text)
    WHERE record.status = 'absent'
  LOOP
    PERFORM public.record_activity_event(
      'attendance_registered', auth.uid(), p_class_id, v_absent_student_id, NULL, p_date,
      'attendance-absence:' || p_operation_id::text || ':' || v_absent_student_id::text,
      jsonb_build_object('period', p_period, 'status', 'absent', 'is_session', false)
    );
  END LOOP;
END;
$$;

-- Evaluation writes likewise create one class-level event plus a private
-- notification for every linked parent of each affected pupil.
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
  v_event_id uuid;
  v_student_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() <> 'professeur' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVALUATION_NOT_AUTHORIZED';
  END IF;
  IF p_operation_id IS NULL OR p_class_id IS NULL OR p_competency_id IS NULL
     OR p_date IS NULL OR coalesce(cardinality(p_student_ids), 0) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVALUATION_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id AND c.is_archived = false AND sy.is_closed = false
      AND (c.teacher_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.teacher_class_assignments tca WHERE tca.class_id = c.id AND tca.teacher_id = auth.uid()
      ))
  ) OR NOT EXISTS (SELECT 1 FROM public.competencies WHERE id = p_competency_id AND coalesce(is_archived, false) = false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVALUATION_NOT_AUTHORIZED';
  END IF;
  SELECT count(*), count(DISTINCT requested.student_id) INTO v_input_count, v_distinct_input_count
  FROM unnest(p_student_ids) AS requested(student_id);
  IF v_input_count <> v_distinct_input_count OR EXISTS (
    SELECT 1 FROM unnest(p_student_ids) AS requested(student_id)
    LEFT JOIN public.students s ON s.id = requested.student_id
    WHERE s.id IS NULL OR s.class_id IS DISTINCT FROM p_class_id OR s.is_archived = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVALUATION_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('evaluation:' || auth.uid()::text || ':' || p_class_id::text || ':' || p_competency_id::text || ':' || p_date::text));
  SELECT count(*) INTO v_existing_count FROM public.evaluations e
  WHERE e.teacher_id = auth.uid() AND e.class_id = p_class_id AND e.competency_id = p_competency_id
    AND e.date = p_date AND e.student_id = ANY(p_student_ids);
  IF v_existing_count > 0 THEN
    SELECT count(*) INTO v_matching_count FROM public.evaluations e
    WHERE e.teacher_id = auth.uid() AND e.class_id = p_class_id AND e.competency_id = p_competency_id
      AND e.date = p_date AND e.student_id = ANY(p_student_ids) AND e.client_operation_id = p_operation_id;
    IF v_existing_count = v_input_count AND v_matching_count = v_input_count THEN RETURN; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVALUATION_ALREADY_SAVED';
  END IF;
  INSERT INTO public.evaluations (student_id, competency_id, teacher_id, class_id, date, client_operation_id)
  SELECT requested.student_id, p_competency_id, auth.uid(), p_class_id, p_date, p_operation_id
  FROM unnest(p_student_ids) AS requested(student_id);
  v_event_id := public.record_activity_event(
    'evaluation_recorded', auth.uid(), p_class_id, NULL, p_competency_id, p_date,
    'evaluation-submit:' || p_operation_id::text,
    jsonb_build_object('student_count', v_input_count, 'student_ids', to_jsonb(p_student_ids), 'is_session', true)
  );
  PERFORM public.notify_activity_management(v_event_id, 'evaluation_recorded', 'normal', p_class_id, NULL,
    jsonb_build_object('student_count', v_input_count, 'student_ids', to_jsonb(p_student_ids), 'is_session', true), 'evaluation');
  FOREACH v_student_id IN ARRAY p_student_ids LOOP
    PERFORM public.record_activity_event(
      'evaluation_recorded', auth.uid(), p_class_id, v_student_id, p_competency_id, p_date,
      'evaluation-penalty:' || p_operation_id::text || ':' || v_student_id::text,
      jsonb_build_object('score_delta', -1, 'is_session', false)
    );
    PERFORM public.notify_activity_parents(v_event_id, 'evaluation_recorded', 'normal', p_class_id, v_student_id,
      jsonb_build_object('competency_id', p_competency_id, 'evaluation_date', p_date), 'evaluation');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_attendance_register(
  p_class_id uuid,
  p_date date,
  p_period text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_count integer;
  v_absent_student_id uuid;
  v_teacher_id uuid;
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('admin', 'directeur') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_CONFIRMATION_NOT_AUTHORIZED';
  END IF;
  IF p_class_id IS NULL OR p_date IS NULL OR p_period NOT IN ('morning', 'afternoon') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_CONFIRMATION_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = p_class_id AND c.is_archived = false AND sy.is_closed = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_CONFIRMATION_NOT_AUTHORIZED';
  END IF;
  SELECT count(*) INTO v_pending_count FROM public.attendance
  WHERE class_id = p_class_id AND date = p_date AND period = p_period AND is_confirmed_by_admin = false;
  IF v_pending_count = 0 THEN RETURN; END IF;
  UPDATE public.attendance SET is_confirmed_by_admin = true
  WHERE class_id = p_class_id AND date = p_date AND period = p_period;
  v_event_id := public.record_activity_event(
    'attendance_confirmed', auth.uid(), p_class_id, NULL, NULL, current_date,
    'attendance-confirm:' || p_class_id::text || ':' || p_date::text || ':' || p_period,
    jsonb_build_object('attendance_date', p_date, 'period', p_period, 'student_count', v_pending_count)
  );
  PERFORM public.notify_activity_management(v_event_id, 'attendance_confirmed', 'normal', p_class_id, NULL,
    jsonb_build_object('attendance_date', p_date, 'period', p_period, 'student_count', v_pending_count), 'info');
  FOR v_teacher_id IN
    SELECT DISTINCT teacher_id FROM public.attendance
    WHERE class_id = p_class_id AND date = p_date AND period = p_period AND teacher_id IS NOT NULL
  LOOP
    PERFORM public.queue_activity_notification(v_teacher_id, v_event_id, 'attendance_confirmed', 'normal', p_class_id, NULL,
      jsonb_build_object('attendance_date', p_date, 'period', p_period),
      v_event_id::text || ':teacher:' || v_teacher_id::text, 'info');
  END LOOP;
  FOR v_absent_student_id IN
    SELECT student_id FROM public.attendance
    WHERE class_id = p_class_id AND date = p_date AND period = p_period AND status = 'absent'
  LOOP
    PERFORM public.notify_activity_parents(v_event_id, 'attendance_confirmed', 'high', p_class_id, v_absent_student_id,
      jsonb_build_object('attendance_date', p_date, 'period', p_period, 'status', 'absent'), 'alert');
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_attendance_register(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_attendance_register(uuid, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_attendance_register(uuid, uuid, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_daily_evaluation(uuid, uuid, uuid, date, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_attendance_register(uuid, uuid, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_daily_evaluation(uuid, uuid, uuid, date, uuid[]) TO authenticated;

COMMIT;
