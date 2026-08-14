import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Teacher, Classe } from "@/types";

// No SQL migration needed for teacher archiving: uses the existing profiles.status field.
// Archiving sets status = 'suspended', which hides the teacher from the active list
// while keeping all evaluation rows and profile(full_name) joins intact.

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export interface UseTeachersReturn {
  teachers: Teacher[];
  classes: Classe[];
  /** teacherId → classIds[] — from teacher_class_assignments in real mode */
  teacherAssignedClassIds: Record<string, string[]>;
  /** teacherId -> classId for the class where the teacher is the principal teacher. */
  primaryClassByTeacherId: Record<string, string>;
  loading: boolean;
  error: string | null;
  canAddManually: boolean;
  refetch: () => Promise<void>;
  updateTeacher: (
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[]; primaryClassId?: string | null }
  ) => Promise<void>;
  archiveTeacher: (id: string) => Promise<void>;
}

export function useTeachers(): UseTeachersReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Always call store hooks (React rules of hooks)
  const storeTeachers = useAppStore((s) => s.teachers);
  const storeClasses = useAppStore((s) => s.classes);
  const storeTeacherClassAssignments = useAppStore((s) => s.teacherClassAssignments);
  const storeUpdateTeacher = useAppStore((s) => s.updateTeacher);
  const storeDeleteTeacher = useAppStore((s) => s.deleteTeacher);
  const storeAssignTeacherToClass = useAppStore((s) => s.assignTeacherToClass);
  const storeUnassignTeacherFromClass = useAppStore((s) => s.unassignTeacherFromClass);

  const [sbTeachers, setSbTeachers] = useState<Teacher[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbAssignments, setSbAssignments] = useState<Record<string, string[]>>({});
  const [sbPrimaryClasses, setSbPrimaryClasses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, classesRes, assignmentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, phone, created_at")
          .eq("role", "professeur")
          .eq("status", "active")
          .order("full_name"),
        supabase
          .from("classes")
          .select("id, name, level_id, teacher_id, capacity, student_count, is_archived, school_year_id, created_at")
          .eq("is_archived", false)
          .order("name"),
        supabase
          .from("teacher_class_assignments")
          .select("teacher_id, class_id"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (classesRes.error) throw classesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const teachers: Teacher[] = (profilesRes.data ?? []).map((p) => {
        const { firstName, lastName } = splitFullName(p.full_name ?? "");
        return {
          id: p.id,
          userId: p.id,
          firstName,
          lastName,
          email: p.email,
          phone: p.phone ?? undefined,
          createdAt: p.created_at,
        };
      });

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        levelId: c.level_id ?? "",
        teacherId: c.teacher_id ?? undefined,
        capacity: c.capacity,
        studentCount: c.student_count,
        isArchived: c.is_archived,
        schoolYearId: c.school_year_id,
        createdAt: c.created_at,
      }));

      // Build teacherId → classIds[] map
      const assignmentsMap: Record<string, string[]> = {};
      for (const row of assignmentsRes.data ?? []) {
        if (!assignmentsMap[row.teacher_id]) assignmentsMap[row.teacher_id] = [];
        assignmentsMap[row.teacher_id].push(row.class_id);
      }

      const primaryClassesMap: Record<string, string> = {};
      for (const classe of classes) {
        if (classe.teacherId) primaryClassesMap[classe.teacherId] = classe.id;
      }

      setSbTeachers(teachers);
      setSbClasses(classes);
      setSbAssignments(assignmentsMap);
      setSbPrimaryClasses(primaryClassesMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des professeurs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real update ───────────────────────────────────────────

  const updateTeacherReal = useCallback(
    async (
      id: string,
      data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[]; primaryClassId?: string | null }
    ) => {
      if (!supabase) return;

      // 1. Update profile name/phone
      const current = sbTeachers.find((t) => t.id === id);
      const profileUpdate: Record<string, string | null> = {};
      if (data.firstName !== undefined || data.lastName !== undefined) {
        const fn = data.firstName ?? current?.firstName ?? "";
        const ln = data.lastName ?? current?.lastName ?? "";
        profileUpdate.full_name = `${fn} ${ln}`.trim();
      }
      if (data.phone !== undefined) profileUpdate.phone = data.phone || null;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: err } = await supabase.from("profiles").update(profileUpdate).eq("id", id);
        if (err) throw new Error(err.message);
      }

      // 2. Sync class assignments (delete all, then re-insert selected)
      if (data.assignedClassIds !== undefined) {
        const { error: delErr } = await supabase
          .from("teacher_class_assignments")
          .delete()
          .eq("teacher_id", id);
        if (delErr) throw new Error(delErr.message);

        if (data.assignedClassIds.length > 0) {
          const rows = data.assignedClassIds.map((classId) => ({ teacher_id: id, class_id: classId }));
          const { error: insErr } = await supabase.from("teacher_class_assignments").insert(rows);
          if (insErr) throw new Error(insErr.message);
        }
      }

      // 3. A principal teacher is stored separately on classes.teacher_id.
      if (data.primaryClassId !== undefined) {
        const { error: clearErr } = await supabase
          .from("classes")
          .update({ teacher_id: null })
          .eq("teacher_id", id);
        if (clearErr) throw new Error(clearErr.message);

        if (data.primaryClassId) {
          const { error: principalErr } = await supabase
            .from("classes")
            .update({ teacher_id: id })
            .eq("id", data.primaryClassId);
          if (principalErr) throw new Error(principalErr.message);

          // Principal teachers must also have normal access to their class.
          const { error: accessErr } = await supabase
            .from("teacher_class_assignments")
            .upsert(
              { teacher_id: id, class_id: data.primaryClassId },
              { onConflict: "teacher_id,class_id" }
            );
          if (accessErr) throw new Error(accessErr.message);
        }
      }

      await fetchFromSupabase();
    },
    [sbTeachers, fetchFromSupabase]
  );

  // ── Real archive ──────────────────────────────────────────

  // Suspending sets status = 'suspended': hides from active list, blocks login,
  // but keeps all evaluation rows and profile joins intact for timeline charts.
  const archiveTeacherReal = useCallback(
    async (id: string) => {
      if (!supabase) throw new Error("Supabase non disponible");
      // Remove class assignments so classes appear unassigned
      const { error: delErr } = await supabase
        .from("teacher_class_assignments")
        .delete()
        .eq("teacher_id", id);
      if (delErr) throw new Error(delErr.message);
      const { error: clearPrincipalErr } = await supabase
        .from("classes")
        .update({ teacher_id: null })
        .eq("teacher_id", id);
      if (clearPrincipalErr) throw new Error(clearPrincipalErr.message);
      // Suspend the profile
      const { error: err } = await supabase
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  // ── Demo update ───────────────────────────────────────────

  const updateTeacherDemo = useCallback(
    async (
      id: string,
      data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[]; primaryClassId?: string | null }
    ) => {
      storeUpdateTeacher(id, { firstName: data.firstName, lastName: data.lastName, phone: data.phone });
      if (data.assignedClassIds !== undefined) {
        // Sync demo assignments: unassign all current, then assign selected
        const current = storeTeacherClassAssignments.filter((a) => a.teacherId === id);
        current.forEach((a) => storeUnassignTeacherFromClass(id, a.classId));
        data.assignedClassIds.forEach((classId) => storeAssignTeacherToClass(id, classId));
      }
      if (data.primaryClassId !== undefined) {
        storeClasses.forEach((classe) => {
          if (classe.teacherId === id && classe.id !== data.primaryClassId) {
            useAppStore.getState().updateClass(classe.id, { teacherId: undefined });
          }
        });
        if (data.primaryClassId) {
          useAppStore.getState().updateClass(data.primaryClassId, { teacherId: id });
          storeAssignTeacherToClass(id, data.primaryClassId);
        }
      }
    },
    [storeUpdateTeacher, storeTeacherClassAssignments, storeAssignTeacherToClass, storeUnassignTeacherFromClass]
  );

  const archiveTeacherDemo = useCallback(
    async (id: string) => { storeDeleteTeacher(id); },
    [storeDeleteTeacher]
  );

  // Build demo assignments map
  const demoAssignmentsMap: Record<string, string[]> = {};
  for (const a of storeTeacherClassAssignments) {
    if (!demoAssignmentsMap[a.teacherId]) demoAssignmentsMap[a.teacherId] = [];
    demoAssignmentsMap[a.teacherId].push(a.classId);
  }
  const demoPrimaryClassesMap: Record<string, string> = {};
  for (const classe of storeClasses) {
    if (classe.teacherId) demoPrimaryClassesMap[classe.teacherId] = classe.id;
  }

  return {
    teachers: isDemo ? storeTeachers : sbTeachers,
    classes: isDemo ? storeClasses : sbClasses,
    teacherAssignedClassIds: isDemo ? demoAssignmentsMap : sbAssignments,
    primaryClassByTeacherId: isDemo ? demoPrimaryClassesMap : sbPrimaryClasses,
    loading,
    error,
    canAddManually: isDemo,
    refetch: fetchFromSupabase,
    updateTeacher: isDemo ? updateTeacherDemo : updateTeacherReal,
    archiveTeacher: isDemo ? archiveTeacherDemo : archiveTeacherReal,
  };
}
