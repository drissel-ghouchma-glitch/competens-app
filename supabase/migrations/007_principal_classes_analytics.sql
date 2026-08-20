-- Principal teachers can read the evaluation history of students in the
-- classes for which they are explicitly responsible. This is read-only and
-- does not change the existing policy that permits teachers to write only
-- their own evaluation events.

DROP POLICY IF EXISTS "evaluations: principal teacher read own class" ON public.evaluations;

CREATE POLICY "evaluations: principal teacher read own class"
  ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'professeur'
    AND class_id IN (
      SELECT id
      FROM public.classes
      WHERE teacher_id = auth.uid()
        AND is_archived = false
    )
  );
