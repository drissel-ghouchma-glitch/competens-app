-- ============================================================
-- Migration 013: principal-teacher recovery limit and admin queue
--
-- A class principal may reset a pupil's same competency to 100% twice
-- per open school year/class. A third reset creates a durable request
-- for school management instead of changing the recovery ledger.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.skill_recovery_requests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competency_id               uuid NOT NULL REFERENCES public.competencies(id) ON DELETE RESTRICT,
  class_id                    uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  requested_by                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  current_score               integer NOT NULL CHECK (current_score BETWEEN 0 AND 100),
  principal_reset_count       integer NOT NULL CHECK (principal_reset_count >= 2),
  meeting_date                date NOT NULL,
  student_reason              text NOT NULL CHECK (length(trim(student_reason)) > 0),
  meeting_notes               text NOT NULL CHECK (length(trim(meeting_notes)) > 0),
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  reviewed_by                 uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at                 timestamptz,
  resolved_recovery_action_id uuid REFERENCES public.skill_recovery_actions(id) ON DELETE RESTRICT,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND resolved_recovery_action_id IS NULL)
    OR status IN ('completed', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_skill_recovery_requests_pending
  ON public.skill_recovery_requests(class_id, created_at)
  WHERE status = 'pending';

-- One outstanding review item per pupil, competency and class is enough.
CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_recovery_requests_pending_skill
  ON public.skill_recovery_requests(student_id, competency_id, class_id)
  WHERE status = 'pending';

ALTER TABLE public.skill_recovery_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill recovery requests: management or requester read" ON public.skill_recovery_requests;
CREATE POLICY "skill recovery requests: management or requester read"
  ON public.skill_recovery_requests
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'directeur')
    OR requested_by = auth.uid()
  );

GRANT SELECT ON public.skill_recovery_requests TO authenticated;

-- Keep the new queue read-only when its class year has been closed.
DROP TRIGGER IF EXISTS trg_closed_year_recovery_requests ON public.skill_recovery_requests;
CREATE TRIGGER trg_closed_year_recovery_requests
  BEFORE INSERT OR UPDATE OR DELETE ON public.skill_recovery_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write();

-- This replaces the version in migration 010 while preserving its immutable
-- ledger calculation and closed-year protection.
CREATE OR REPLACE FUNCTION public.create_skill_recovery_action(
  p_student_id uuid,
  p_competency_id uuid,
  p_action_type text,
  p_new_score integer,
  p_meeting_date date,
  p_student_reason text,
  p_meeting_notes text
)
RETURNS public.skill_recovery_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id uuid;
  v_role text;
  v_current_score integer := 100;
  v_principal_reset_count integer := 0;
  v_event record;
  v_action public.skill_recovery_actions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT s.class_id INTO v_class_id
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  JOIN public.school_years sy ON sy.id = c.school_year_id
  WHERE s.id = p_student_id AND s.is_archived = false AND sy.is_closed = false;
  IF NOT FOUND OR v_class_id IS NULL THEN
    RAISE EXCEPTION 'Student or current open-year class was not found';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_role, '') NOT IN ('admin', 'directeur')
     AND NOT EXISTS (
       SELECT 1 FROM public.classes
       WHERE id = v_class_id AND teacher_id = auth.uid() AND is_archived = false
     ) THEN
    RAISE EXCEPTION 'Only an administrator, director, or this class principal teacher can recover a skill';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.competencies
    WHERE id = p_competency_id AND coalesce(is_archived, false) = false
  ) THEN
    RAISE EXCEPTION 'Competency is not active';
  END IF;
  IF p_action_type NOT IN ('increase', 'reset_to_100') THEN
    RAISE EXCEPTION 'Invalid recovery action type';
  END IF;
  IF p_new_score NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Score must be between 0 and 100';
  END IF;
  IF p_action_type = 'reset_to_100' AND p_new_score <> 100 THEN
    RAISE EXCEPTION 'A reset action must set the score to 100';
  END IF;
  IF p_meeting_date IS NULL OR trim(coalesce(p_student_reason, '')) = '' OR trim(coalesce(p_meeting_notes, '')) = '' THEN
    RAISE EXCEPTION 'Meeting date, student reason, and meeting notes are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_class_id::text || ':' || p_student_id::text || ':' || p_competency_id::text));

  FOR v_event IN
    SELECT event_date, event_created_at, event_type, new_score
    FROM (
      SELECT e.date AS event_date, e.created_at AS event_created_at,
             'penalty'::text AS event_type, NULL::integer AS new_score
      FROM public.evaluations e
      WHERE e.student_id = p_student_id
        AND e.competency_id = p_competency_id
        AND e.class_id = v_class_id
      UNION ALL
      SELECT r.meeting_date, r.created_at, r.action_type, r.new_score
      FROM public.skill_recovery_actions r
      WHERE r.student_id = p_student_id
        AND r.competency_id = p_competency_id
        AND r.class_id = v_class_id
    ) ledger
    ORDER BY event_date, event_created_at
  LOOP
    IF v_event.event_type = 'penalty' THEN
      v_current_score := greatest(0, v_current_score - 1);
    ELSE
      v_current_score := v_event.new_score;
    END IF;
  END LOOP;

  IF p_new_score <= v_current_score THEN
    RAISE EXCEPTION 'The new score must be strictly greater than the current score (%)', v_current_score;
  END IF;

  IF v_role = 'professeur' AND p_action_type = 'reset_to_100' THEN
    SELECT count(*) INTO v_principal_reset_count
    FROM public.skill_recovery_actions r
    JOIN public.profiles creator ON creator.id = r.created_by
    WHERE r.student_id = p_student_id
      AND r.competency_id = p_competency_id
      AND r.class_id = v_class_id
      AND r.action_type = 'reset_to_100'
      AND creator.role = 'professeur';

    IF v_principal_reset_count >= 2 THEN
      INSERT INTO public.skill_recovery_requests (
        student_id, competency_id, class_id, requested_by, current_score,
        principal_reset_count, meeting_date, student_reason, meeting_notes
      ) VALUES (
        p_student_id, p_competency_id, v_class_id, auth.uid(), v_current_score,
        v_principal_reset_count, p_meeting_date, trim(p_student_reason), trim(p_meeting_notes)
      )
      ON CONFLICT (student_id, competency_id, class_id) WHERE status = 'pending' DO NOTHING;

      -- NULL is a deliberate successful result: the request was queued and no
      -- recovery action was written. The client displays an explicit notice.
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.skill_recovery_actions (
    student_id, competency_id, class_id, action_type,
    previous_score, new_score, meeting_date,
    student_reason, meeting_notes, created_by
  ) VALUES (
    p_student_id, p_competency_id, v_class_id, p_action_type,
    v_current_score, p_new_score, p_meeting_date,
    trim(p_student_reason), trim(p_meeting_notes), auth.uid()
  ) RETURNING * INTO v_action;

  -- A management reset fulfils the oldest matching outstanding request.
  IF v_role IN ('admin', 'directeur') AND p_action_type = 'reset_to_100' THEN
    WITH next_request AS (
      SELECT id
      FROM public.skill_recovery_requests
      WHERE student_id = p_student_id
        AND competency_id = p_competency_id
        AND class_id = v_class_id
        AND status = 'pending'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.skill_recovery_requests request
    SET status = 'completed',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        resolved_recovery_action_id = v_action.id
    FROM next_request
    WHERE request.id = next_request.id;
  END IF;

  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) TO authenticated;

COMMIT;
