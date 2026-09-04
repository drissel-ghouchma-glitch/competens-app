-- ============================================================
-- Migration 015: teacher notification centre refinements
-- ============================================================

BEGIN;

-- Teachers can work in every class explicitly assigned to them, not only
-- classes where they are the principal teacher. This also lets the activity
-- screen resolve the names of their pupils and assigned classes correctly.
DROP POLICY IF EXISTS "classes: teacher read own" ON public.classes;
CREATE POLICY "classes: teacher read assigned"
  ON public.classes FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND (
      teacher_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.teacher_class_assignments assignment
        WHERE assignment.class_id = classes.id AND assignment.teacher_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "students: teacher read own class" ON public.students;
CREATE POLICY "students: teacher read assigned classes"
  ON public.students FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND EXISTS (
      SELECT 1 FROM public.classes class_row
      WHERE class_row.id = students.class_id
        AND (
          class_row.teacher_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.teacher_class_assignments assignment
            WHERE assignment.class_id = class_row.id AND assignment.teacher_id = auth.uid()
          )
        )
    )
  );

-- A submitted request is itself a useful confirmation for the teacher.  The
-- trigger keeps working when the request is created later by offline sync.
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
    PERFORM public.queue_activity_notification(
      NEW.teacher_id, v_event_id, 'admin_request_submitted', 'normal', NULL, NULL,
      jsonb_build_object('request_type', NEW.type, 'status', NEW.status),
      v_event_id::text || ':requester:' || NEW.teacher_id::text, 'info'
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

COMMIT;
