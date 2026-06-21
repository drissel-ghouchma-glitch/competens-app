-- ============================================================
-- CORRECTIF RLS — Classes lisibles par tous les utilisateurs
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Permettre à tous les utilisateurs authentifiés de lire TOUTES les classes
--    (Les professeurs doivent voir toutes les classes pour pouvoir en demander l'accès)
DROP POLICY IF EXISTS "teachers_read_own_classes" ON public.classes;
DROP POLICY IF EXISTS "professeur_read_assigned_classes" ON public.classes;
DROP POLICY IF EXISTS "read_own_classes" ON public.classes;

CREATE POLICY "authenticated_read_all_classes"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Ajouter la contrainte UNIQUE sur teacher_class_assignments
--    (Nécessaire pour le upsert avec onConflict)
ALTER TABLE public.teacher_class_assignments
  DROP CONSTRAINT IF EXISTS teacher_class_assignments_teacher_class_unique;

ALTER TABLE public.teacher_class_assignments
  ADD CONSTRAINT teacher_class_assignments_teacher_class_unique
  UNIQUE (teacher_id, class_id);

-- 3. Vérification : afficher les politiques actuelles sur classes
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'classes';
