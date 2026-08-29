-- ============================================================
-- Migration 010: professional school-year closure and student rollover
-- Run after migration 009 in Supabase Dashboard > SQL Editor.
-- ============================================================

BEGIN;

-- Some early installations added this column manually from the Students UI.
-- Make the migration self-contained for projects that did not.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_students_active_class
  ON public.students(class_id)
  WHERE is_archived = false;

UPDATE public.school_years SET is_active = false WHERE is_closed AND is_active;
WITH ranked_active_years AS (
  SELECT id, row_number() OVER (ORDER BY start_date DESC, created_at DESC) AS position
  FROM public.school_years WHERE is_active
)
UPDATE public.school_years sy SET is_active = false
FROM ranked_active_years ranked
WHERE sy.id = ranked.id AND ranked.position > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_years_one_active
  ON public.school_years(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'promoted', 'repeated', 'graduated', 'transferred', 'withdrawn')),
  started_at date NOT NULL,
  ended_at date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, school_year_id)
);

CREATE TABLE IF NOT EXISTS public.student_promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  source_school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  source_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  target_school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  target_class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'promote', 'repeat', 'graduate', 'transfer', 'withdraw')),
  notes text,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, source_school_year_id)
);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_year_class
  ON public.student_enrollments(school_year_id, class_id);
CREATE INDEX IF NOT EXISTS idx_promotion_decisions_source_year
  ON public.student_promotion_decisions(source_school_year_id, decision);
CREATE INDEX IF NOT EXISTS idx_promotion_decisions_target_class
  ON public.student_promotion_decisions(target_class_id)
  WHERE target_class_id IS NOT NULL;

ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_promotion_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student enrollments: admin manage" ON public.student_enrollments;
CREATE POLICY "student enrollments: admin manage"
  ON public.student_enrollments FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "student enrollments: director read" ON public.student_enrollments;
CREATE POLICY "student enrollments: director read"
  ON public.student_enrollments FOR SELECT TO authenticated
  USING (public.current_user_role() = 'directeur');

DROP POLICY IF EXISTS "student enrollments: parent read child" ON public.student_enrollments;
DO $$ BEGIN
  IF to_regclass('public.parent_student') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY "student enrollments: parent read child"
      ON public.student_enrollments FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.parent_id = auth.uid() AND ps.student_id = student_enrollments.student_id
      ))
    $policy$;
  END IF;
END $$;

DROP POLICY IF EXISTS "classes: parent read child history" ON public.classes;
DO $$ BEGIN
  IF to_regclass('public.parent_student') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY "classes: parent read child history"
      ON public.classes FOR SELECT TO authenticated
      USING (
        public.current_user_role() = 'parent'
        AND EXISTS (
          SELECT 1
          FROM public.student_enrollments e
          JOIN public.parent_student ps ON ps.student_id = e.student_id
          WHERE e.class_id = classes.id AND ps.parent_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

DROP POLICY IF EXISTS "promotion decisions: admin manage" ON public.student_promotion_decisions;
CREATE POLICY "promotion decisions: admin manage"
  ON public.student_promotion_decisions FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "promotion decisions: director read" ON public.student_promotion_decisions;
CREATE POLICY "promotion decisions: director read"
  ON public.student_promotion_decisions FOR SELECT TO authenticated
  USING (public.current_user_role() = 'directeur');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_promotion_decisions TO authenticated;

-- Creates immutable source-year snapshots and one pending decision per pupil.
CREATE OR REPLACE FUNCTION public.prepare_school_year_closure(
  p_source_year_id uuid,
  p_target_year_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators can prepare school-year closure';
  END IF;
  IF p_source_year_id = p_target_year_id THEN
    RAISE EXCEPTION 'Source and target school years must be different';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_years WHERE id = p_source_year_id AND is_closed = false) THEN
    RAISE EXCEPTION 'Source school year is missing or already closed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_years WHERE id = p_target_year_id AND is_closed = false) THEN
    RAISE EXCEPTION 'Target school year is missing or closed';
  END IF;
  IF (SELECT start_date FROM public.school_years WHERE id = p_target_year_id)
     <= (SELECT end_date FROM public.school_years WHERE id = p_source_year_id) THEN
    RAISE EXCEPTION 'Target school year must start after the source school year ends';
  END IF;

  -- Recreate the pedagogical class structure in the target year when needed.
  -- Principal teachers and teacher assignments are intentionally not copied:
  -- the administration assigns next year's staff separately.
  INSERT INTO public.classes (
    name, level_id, school_year_id, capacity, student_count, is_archived
  )
  SELECT sc.name, sc.level_id, p_target_year_id, sc.capacity, 0, false
  FROM public.classes sc
  WHERE sc.school_year_id = p_source_year_id
    AND sc.is_archived = false
    AND NOT EXISTS (
      SELECT 1 FROM public.classes tc
      WHERE tc.school_year_id = p_target_year_id
        AND lower(tc.name) = lower(sc.name)
        AND tc.level_id IS NOT DISTINCT FROM sc.level_id
    );

  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE school_year_id = p_target_year_id AND is_archived = false) THEN
    RAISE EXCEPTION 'Create target-year classes before preparing closure';
  END IF;

  INSERT INTO public.student_enrollments (
    student_id, school_year_id, class_id, status, started_at, created_by
  )
  SELECT s.id, p_source_year_id, c.id, 'active', sy.start_date, auth.uid()
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  JOIN public.school_years sy ON sy.id = c.school_year_id
  WHERE c.school_year_id = p_source_year_id AND s.is_archived = false
  ON CONFLICT (student_id, school_year_id) DO NOTHING;

  DELETE FROM public.student_promotion_decisions d
  WHERE d.source_school_year_id = p_source_year_id
    AND d.executed_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = d.student_id
        AND s.is_archived = false
        AND c.school_year_id = p_source_year_id
    );

  INSERT INTO public.student_promotion_decisions (
    student_id, source_school_year_id, source_class_id,
    target_school_year_id, decision
  )
  SELECT s.id, p_source_year_id, c.id, p_target_year_id,
         CASE WHEN upper(l.code) = 'CM2' THEN 'graduate' ELSE 'pending' END
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.levels l ON l.id = c.level_id
  WHERE c.school_year_id = p_source_year_id AND s.is_archived = false
  ON CONFLICT (student_id, source_school_year_id) DO UPDATE
    SET target_school_year_id = EXCLUDED.target_school_year_id,
        source_class_id = EXCLUDED.source_class_id,
        updated_at = now()
    WHERE student_promotion_decisions.executed_at IS NULL;

  SELECT count(*) INTO v_count
  FROM public.student_promotion_decisions
  WHERE source_school_year_id = p_source_year_id;
  RETURN v_count;
END;
$$;

-- Executes every approved decision and closes/activates years atomically.
CREATE OR REPLACE FUNCTION public.finalize_school_year_closure(
  p_source_year_id uuid,
  p_target_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_end date;
  v_target_start date;
  v_student_count integer;
  v_decision_count integer;
  v_promoted integer;
  v_repeated integer;
  v_graduated integer;
  v_transferred integer;
  v_withdrawn integer;
  v_invalid record;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators can finalize school-year closure';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('school-year-closure:' || p_source_year_id::text));

  SELECT end_date INTO v_source_end
  FROM public.school_years WHERE id = p_source_year_id AND is_closed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source school year is missing or already closed'; END IF;

  SELECT start_date INTO v_target_start
  FROM public.school_years WHERE id = p_target_year_id AND is_closed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target school year is missing or closed'; END IF;

  SELECT count(*) INTO v_student_count
  FROM public.students s JOIN public.classes c ON c.id = s.class_id
  WHERE c.school_year_id = p_source_year_id AND s.is_archived = false;

  SELECT count(*) INTO v_decision_count
  FROM public.student_promotion_decisions
  WHERE source_school_year_id = p_source_year_id
    AND target_school_year_id = p_target_year_id;

  IF v_decision_count <> v_student_count THEN
    RAISE EXCEPTION 'Every source-year student must have exactly one decision';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.student_promotion_decisions d
    JOIN public.students s ON s.id = d.student_id
    WHERE d.source_school_year_id = p_source_year_id
      AND s.class_id IS DISTINCT FROM d.source_class_id
  ) THEN
    RAISE EXCEPTION 'A student changed class after preparation; prepare the closure again';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_promotion_decisions
    WHERE source_school_year_id = p_source_year_id AND decision = 'pending'
  ) THEN
    RAISE EXCEPTION 'Resolve every pending student decision before closure';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_promotion_decisions
    WHERE source_school_year_id = p_source_year_id
      AND decision IN ('promote', 'repeat') AND target_class_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Promoted and repeating students require a target class';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.student_promotion_decisions d
    JOIN public.classes tc ON tc.id = d.target_class_id
    WHERE d.source_school_year_id = p_source_year_id
      AND d.target_class_id IS NOT NULL
      AND (tc.school_year_id <> p_target_year_id OR tc.is_archived)
  ) THEN
    RAISE EXCEPTION 'A target class does not belong to the open target year';
  END IF;

  -- Repeat must stay in the same level; promotion must follow CP1..CM2 order.
  SELECT d.id, sl.code AS source_code, tl.code AS target_code, d.decision
  INTO v_invalid
  FROM public.student_promotion_decisions d
  JOIN public.classes sc ON sc.id = d.source_class_id
  LEFT JOIN public.levels sl ON sl.id = sc.level_id
  LEFT JOIN public.classes tc ON tc.id = d.target_class_id
  LEFT JOIN public.levels tl ON tl.id = tc.level_id
  WHERE d.source_school_year_id = p_source_year_id
    AND (
      (d.decision = 'repeat' AND upper(coalesce(sl.code, '')) <> upper(coalesce(tl.code, '')))
      OR (d.decision = 'graduate' AND upper(coalesce(sl.code, '')) <> 'CM2')
      OR
      (d.decision = 'promote' AND upper(coalesce(tl.code, '')) <>
        CASE upper(coalesce(sl.code, ''))
          WHEN 'CP1' THEN 'CP2' WHEN 'CP2' THEN 'CE1' WHEN 'CE1' THEN 'CE2'
          WHEN 'CE2' THEN 'CM1' WHEN 'CM1' THEN 'CM2' ELSE '__INVALID__'
        END)
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Invalid level transition: % from % to %', v_invalid.decision, v_invalid.source_code, v_invalid.target_code;
  END IF;

  -- Capacity includes existing target-year pupils plus incoming decisions.
  SELECT tc.id, tc.name, tc.capacity,
         (SELECT count(*) FROM public.students current_student WHERE current_student.class_id = tc.id)
         + count(d.id) AS projected_count
  INTO v_invalid
  FROM public.classes tc
  JOIN public.student_promotion_decisions d ON d.target_class_id = tc.id
  WHERE d.source_school_year_id = p_source_year_id
    AND d.decision IN ('promote', 'repeat')
  GROUP BY tc.id, tc.name, tc.capacity
  HAVING (SELECT count(*) FROM public.students current_student WHERE current_student.class_id = tc.id)
         + count(d.id) > tc.capacity
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Target class % exceeds capacity (% > %)', v_invalid.name, v_invalid.projected_count, v_invalid.capacity;
  END IF;

  -- Authorize only this transaction to perform the cross-year moves and the
  -- final source-year state transition guarded by the triggers below.
  PERFORM set_config('app.school_year_closure', 'on', true);

  UPDATE public.student_enrollments e
  SET status = CASE d.decision
        WHEN 'promote' THEN 'promoted' WHEN 'repeat' THEN 'repeated'
        WHEN 'graduate' THEN 'graduated' WHEN 'transfer' THEN 'transferred'
        ELSE 'withdrawn' END,
      ended_at = v_source_end,
      updated_at = now()
  FROM public.student_promotion_decisions d
  WHERE e.student_id = d.student_id
    AND e.school_year_id = p_source_year_id
    AND d.source_school_year_id = p_source_year_id;

  INSERT INTO public.student_enrollments (
    student_id, school_year_id, class_id, status, started_at, created_by
  )
  SELECT d.student_id, p_target_year_id, d.target_class_id, 'active', v_target_start, auth.uid()
  FROM public.student_promotion_decisions d
  WHERE d.source_school_year_id = p_source_year_id
    AND d.decision IN ('promote', 'repeat')
  ON CONFLICT (student_id, school_year_id) DO UPDATE
    SET class_id = EXCLUDED.class_id, status = 'active', started_at = EXCLUDED.started_at,
        ended_at = NULL, updated_at = now();

  UPDATE public.students s
  SET class_id = CASE WHEN d.decision IN ('promote', 'repeat') THEN d.target_class_id ELSE NULL END
  FROM public.student_promotion_decisions d
  WHERE s.id = d.student_id AND s.is_archived = false AND d.source_school_year_id = p_source_year_id;

  UPDATE public.alerts a
  SET resolved = true, resolved_at = coalesce(resolved_at, now())
  WHERE a.resolved = false
    AND EXISTS (
      SELECT 1 FROM public.student_promotion_decisions d
      WHERE d.source_school_year_id = p_source_year_id AND d.student_id = a.student_id
    );

  UPDATE public.classes c
  SET student_count = (SELECT count(*) FROM public.students s WHERE s.class_id = c.id AND s.is_archived = false)
  WHERE c.school_year_id = p_target_year_id;

  UPDATE public.student_promotion_decisions
  SET executed_at = now(), decided_by = coalesce(decided_by, auth.uid()),
      decided_at = coalesce(decided_at, now()), updated_at = now()
  WHERE source_school_year_id = p_source_year_id;

  UPDATE public.school_years SET is_active = false, updated_at = now() WHERE is_active = true;
  UPDATE public.school_years SET is_closed = true, is_active = false, updated_at = now() WHERE id = p_source_year_id;
  UPDATE public.school_years SET is_active = true, is_closed = false, updated_at = now() WHERE id = p_target_year_id;

  SELECT count(*) FILTER (WHERE decision = 'promote'),
         count(*) FILTER (WHERE decision = 'repeat'),
         count(*) FILTER (WHERE decision = 'graduate'),
         count(*) FILTER (WHERE decision = 'transfer'),
         count(*) FILTER (WHERE decision = 'withdraw')
  INTO v_promoted, v_repeated, v_graduated, v_transferred, v_withdrawn
  FROM public.student_promotion_decisions
  WHERE source_school_year_id = p_source_year_id;

  RETURN jsonb_build_object(
    'promoted', v_promoted, 'repeated', v_repeated, 'graduated', v_graduated,
    'transferred', v_transferred, 'withdrawn', v_withdrawn, 'total', v_decision_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_school_year_closure(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_school_year_closure(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_school_year_closure(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_school_year_closure(uuid, uuid) TO authenticated;

-- Recovery scores are academic-year scoped. This replaces migration 008's
-- all-time ledger calculation so a pupil starts the new class/year at 100.
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;

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
  IF p_action_type NOT IN ('increase', 'reset_to_100') THEN RAISE EXCEPTION 'Invalid recovery action type'; END IF;
  IF p_new_score NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Score must be between 0 and 100'; END IF;
  IF p_action_type = 'reset_to_100' AND p_new_score <> 100 THEN RAISE EXCEPTION 'A reset action must set the score to 100'; END IF;
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

  INSERT INTO public.skill_recovery_actions (
    student_id, competency_id, class_id, action_type,
    previous_score, new_score, meeting_date,
    student_reason, meeting_notes, created_by
  ) VALUES (
    p_student_id, p_competency_id, v_class_id, p_action_type,
    v_current_score, p_new_score, p_meeting_date,
    trim(p_student_reason), trim(p_meeting_notes), auth.uid()
  ) RETURNING * INTO v_action;
  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_skill_recovery_action(uuid, uuid, text, integer, date, text, text) TO authenticated;

-- Prevent the old one-click update from closing a year outside the atomic RPC.
CREATE OR REPLACE FUNCTION public.guard_school_year_closure()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND NEW.is_closed THEN
    RAISE EXCEPTION 'A closed school year cannot be active';
  END IF;
  IF OLD.is_closed AND NOT NEW.is_closed THEN
    RAISE EXCEPTION 'A closed school year cannot be reopened';
  END IF;
  IF NOT OLD.is_closed AND NEW.is_closed
     AND coalesce(current_setting('app.school_year_closure', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the professional closure workflow to close a school year';
  END IF;
  IF NEW.is_active AND NOT OLD.is_active
     AND coalesce(current_setting('app.school_year_closure', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM public.school_years WHERE id <> NEW.id AND is_active) THEN
    RAISE EXCEPTION 'Close the active school year before activating another one';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_school_year_closure ON public.school_years;
CREATE TRIGGER trg_guard_school_year_closure
  BEFORE UPDATE ON public.school_years
  FOR EACH ROW EXECUTE FUNCTION public.guard_school_year_closure();

-- Shared trigger for records carrying class_id.
CREATE OR REPLACE FUNCTION public.guard_closed_class_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_class_id uuid;
  v_new_class_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_class_id := nullif(to_jsonb(OLD)->>'class_id', '')::uuid;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_class_id := nullif(to_jsonb(NEW)->>'class_id', '')::uuid;
  END IF;

  IF (v_old_class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = v_old_class_id AND sy.is_closed
  )) OR (v_new_class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
    WHERE c.id = v_new_class_id AND sy.is_closed
  )) THEN
    RAISE EXCEPTION 'Records from a closed school year are read-only';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closed_year_evaluations ON public.evaluations;
CREATE TRIGGER trg_closed_year_evaluations BEFORE INSERT OR UPDATE OR DELETE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write();

DROP TRIGGER IF EXISTS trg_closed_year_teacher_assignments ON public.teacher_class_assignments;
CREATE TRIGGER trg_closed_year_teacher_assignments BEFORE INSERT OR UPDATE OR DELETE ON public.teacher_class_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write();

DROP TRIGGER IF EXISTS trg_closed_year_student_enrollments ON public.student_enrollments;
CREATE TRIGGER trg_closed_year_student_enrollments BEFORE INSERT OR UPDATE OR DELETE ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write();

DO $$ BEGIN
  IF to_regclass('public.attendance') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_closed_year_attendance ON public.attendance';
    EXECUTE 'CREATE TRIGGER trg_closed_year_attendance BEFORE INSERT OR UPDATE OR DELETE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write()';
  END IF;
  IF to_regclass('public.skill_recovery_actions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_closed_year_recoveries ON public.skill_recovery_actions';
    EXECUTE 'CREATE TRIGGER trg_closed_year_recoveries BEFORE INSERT OR UPDATE OR DELETE ON public.skill_recovery_actions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_write()';
  END IF;
END $$;

-- Classes themselves become immutable as soon as their year is closed.
CREATE OR REPLACE FUNCTION public.guard_closed_class_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_year_id uuid;
  v_new_year_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_year_id := OLD.school_year_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_year_id := NEW.school_year_id; END IF;

  IF (v_old_year_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_years WHERE id = v_old_year_id AND is_closed
  )) OR (v_new_year_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_years WHERE id = v_new_year_id AND is_closed
  )) THEN
    RAISE EXCEPTION 'Classes from a closed school year are read-only';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_closed_class_definition ON public.classes;
CREATE TRIGGER trg_guard_closed_class_definition
  BEFORE INSERT OR UPDATE OR DELETE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_class_definition();

-- Current class changes may not enter or leave an already closed year.
CREATE OR REPLACE FUNCTION public.guard_student_closed_year_move()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_year_id uuid;
  v_new_year_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN RETURN NEW; END IF;
  END IF;
  IF coalesce(current_setting('app.school_year_closure', true), '') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT school_year_id INTO v_old_year_id FROM public.classes WHERE id = OLD.class_id;
  END IF;
  SELECT school_year_id INTO v_new_year_id FROM public.classes WHERE id = NEW.class_id;
  IF TG_OP = 'UPDATE' AND v_old_year_id IS NOT NULL AND v_new_year_id IS NOT NULL
     AND v_old_year_id <> v_new_year_id THEN
    RAISE EXCEPTION 'Use the professional closure workflow to move a student between school years';
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.class_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
       WHERE c.id = OLD.class_id AND sy.is_closed
     )) OR (NEW.class_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.classes c JOIN public.school_years sy ON sy.id = c.school_year_id
       WHERE c.id = NEW.class_id AND sy.is_closed
     )) THEN
    RAISE EXCEPTION 'A student cannot be moved into or out of a closed school year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_closed_year_move ON public.students;
CREATE TRIGGER trg_guard_student_closed_year_move
  BEFORE INSERT OR UPDATE OF class_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_closed_year_move();

-- Keep current-year enrollment history in sync for pupils created or moved
-- through the normal student-management UI.
CREATE OR REPLACE FUNCTION public.sync_current_student_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year_id uuid;
  v_start_date date;
  v_is_closed boolean;
BEGIN
  IF NEW.is_archived THEN
    UPDATE public.student_enrollments
    SET status = 'withdrawn', ended_at = coalesce(ended_at, current_date), updated_at = now()
    WHERE student_id = NEW.id AND status = 'active';
    RETURN NEW;
  END IF;
  IF NEW.class_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.school_year_id, sy.start_date, sy.is_closed
  INTO v_year_id, v_start_date, v_is_closed
  FROM public.classes c
  JOIN public.school_years sy ON sy.id = c.school_year_id
  WHERE c.id = NEW.class_id;
  IF v_year_id IS NULL OR v_is_closed THEN RETURN NEW; END IF;

  INSERT INTO public.student_enrollments (
    student_id, school_year_id, class_id, status, started_at, created_by
  ) VALUES (
    NEW.id, v_year_id, NEW.class_id, 'active', v_start_date, auth.uid()
  )
  ON CONFLICT (student_id, school_year_id) DO UPDATE
    SET class_id = EXCLUDED.class_id, status = 'active', ended_at = NULL, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_current_student_enrollment ON public.students;
CREATE TRIGGER trg_sync_current_student_enrollment
  AFTER INSERT OR UPDATE OF class_id, is_archived ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_current_student_enrollment();

INSERT INTO public.student_enrollments (
  student_id, school_year_id, class_id, status, started_at, created_by
)
SELECT s.id, c.school_year_id, c.id, 'active', sy.start_date, auth.uid()
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
JOIN public.school_years sy ON sy.id = c.school_year_id
WHERE s.is_archived = false AND sy.is_closed = false
ON CONFLICT (student_id, school_year_id) DO NOTHING;

COMMIT;
