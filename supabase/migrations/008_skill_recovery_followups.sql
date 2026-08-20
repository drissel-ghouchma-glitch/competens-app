-- ============================================================
-- Migration 008: Principal teacher skill recovery follow-up
--
-- Run this file in Supabase Dashboard > SQL Editor after migrations 006/007.
-- Recovery records are immutable. They never alter or delete historical
-- penalty rows from public.evaluations.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.skill_recovery_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competency_id   uuid NOT NULL REFERENCES public.competencies(id) ON DELETE RESTRICT,
  class_id        uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  action_type     text NOT NULL CHECK (action_type IN ('increase', 'reset_to_100')),
  previous_score  integer NOT NULL CHECK (previous_score BETWEEN 0 AND 100),
  new_score       integer NOT NULL CHECK (new_score BETWEEN 0 AND 100),
  meeting_date    date NOT NULL,
  student_reason  text NOT NULL CHECK (length(trim(student_reason)) > 0),
  meeting_notes   text NOT NULL CHECK (length(trim(meeting_notes)) > 0),
  created_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (new_score > previous_score),
  CHECK (
    (action_type = 'increase')
    OR (action_type = 'reset_to_100' AND new_score = 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_skill_recovery_student_competency_date
  ON public.skill_recovery_actions(student_id, competency_id, meeting_date, created_at);
CREATE INDEX IF NOT EXISTS idx_skill_recovery_class_id
  ON public.skill_recovery_actions(class_id);

ALTER TABLE public.skill_recovery_actions ENABLE ROW LEVEL SECURITY;

-- Remove direct-write policies if a previous manual version of this table
-- existed. The RPC below is the only supported write path.
DROP POLICY IF EXISTS "skill recoveries: direct insert disabled" ON public.skill_recovery_actions;
DROP POLICY IF EXISTS "skill recoveries: admin read" ON public.skill_recovery_actions;
DROP POLICY IF EXISTS "skill recoveries: principal read" ON public.skill_recovery_actions;
DROP POLICY IF EXISTS "skill recoveries: assigned teacher read" ON public.skill_recovery_actions;
DROP POLICY IF EXISTS "skill recoveries: parent read" ON public.skill_recovery_actions;

CREATE POLICY "skill recoveries: authorised history read"
  ON public.skill_recovery_actions
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'directeur')
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = skill_recovery_actions.class_id
        AND c.teacher_id = auth.uid()
        AND c.is_archived = false
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_class_assignments tca
      WHERE tca.class_id = skill_recovery_actions.class_id
        AND tca.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = skill_recovery_actions.student_id
    )
  );

-- The history tooltip identifies the person who recorded an authorised action.
-- RLS on skill_recovery_actions keeps this limited to recovery events the
-- current user is already allowed to read.
DROP POLICY IF EXISTS "profiles: active users read recovery actor names" ON public.profiles;
CREATE POLICY "profiles: active users read recovery actor names"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_status() = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.skill_recovery_actions r
      WHERE r.created_by = profiles.id
    )
  );

-- Teachers assigned to a class may read the historical penalty ledger for
-- their students. This adds read access only; their existing write policy
-- still limits created penalty events to their own teacher_id.
DROP POLICY IF EXISTS "evaluations: assigned teacher read class history" ON public.evaluations;
CREATE POLICY "evaluations: assigned teacher read class history"
  ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments tca
      WHERE tca.class_id = evaluations.class_id
        AND tca.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "students: assigned teacher read class" ON public.students;
CREATE POLICY "students: assigned teacher read class"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments tca
      WHERE tca.class_id = students.class_id
        AND tca.teacher_id = auth.uid()
    )
  );

-- Security-definer keeps the immutable table closed to direct client INSERTs
-- while validating role, ownership, active competency and the current ledger
-- score atomically on the database.
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
  v_event record;
  v_action public.skill_recovery_actions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT class_id INTO v_class_id
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND OR v_class_id IS NULL THEN
    RAISE EXCEPTION 'Student or current class was not found';
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

  -- Serialize concurrent recovery requests for this exact student/skill so
  -- both requests cannot validate against the same stale running score.
  PERFORM pg_advisory_xact_lock(hashtext(p_student_id::text || ':' || p_competency_id::text));

  -- The chronological ledger always starts at 100. Penalties subtract one;
  -- each recovery action replaces the running value with its recorded score.
  FOR v_event IN
    SELECT event_date, event_created_at, event_type, new_score
    FROM (
      SELECT e.date AS event_date, e.created_at AS event_created_at,
             'penalty'::text AS event_type, NULL::integer AS new_score
      FROM public.evaluations e
      WHERE e.student_id = p_student_id AND e.competency_id = p_competency_id
      UNION ALL
      SELECT r.meeting_date, r.created_at, r.action_type, r.new_score
      FROM public.skill_recovery_actions r
      WHERE r.student_id = p_student_id AND r.competency_id = p_competency_id
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

  INSERT INTO public.skill_recovery_actions (
    student_id, competency_id, class_id, action_type,
    previous_score, new_score, meeting_date,
    student_reason, meeting_notes, created_by
  ) VALUES (
    p_student_id, p_competency_id, v_class_id, p_action_type,
    v_current_score, p_new_score, p_meeting_date,
    trim(p_student_reason), trim(p_meeting_notes), auth.uid()
  )
  RETURNING * INTO v_action;

  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) TO authenticated;

COMMIT;
