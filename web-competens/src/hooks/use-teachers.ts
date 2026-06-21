import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Teacher, Classe } from "@/types";

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
  loading: boolean;
  error: string | null;
  canAddManually: boolean;
  refetch: () => Promise<void>;
  updateTeacher: (
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[] }
  ) => Promise<void>;
}

export function useTeachers(): UseTeachersReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Always call store hooks (React rules of hooks)
  const storeTeachers = useAppStore((s) => s.teachers);
  const storeClasses = useAppStore((s) => s.classes);
  const storeTeacherClassAssignments = useAppStore((s) => s.teacherClassAssignments);
  const storeUpdateTeacher = useAppStore((s) => s.updateTeacher);
  const storeAssignTeacherToClass = useAppStore((s) => s.assignTeacherToClass);
  const storeUnassignTeacherFromClass = useAppStore((s) => s.unassignTeacherFromClass);

  const [sbTeachers, setSbTeachers] = useState<Teacher[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbAssignments, setSbAssignments] = useState<Record<string, string[]>>({});
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
          .select("id, name, level_id, capacity, student_count, is_archived, school_year_id, created_at")
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

      setSbTeachers(teachers);
      setSbClasses(classes);
      setSbAssignments(assignmentsMap);
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
      data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[] }
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

      await fetchFromSupabase();
    },
    [sbTeachers, fetchFromSupabase]
  );

  // ── Demo update ───────────────────────────────────────────

  const updateTeacherDemo = useCallback(
    async (
      id: string,
      data: { firstName?: string; lastName?: string; phone?: string; assignedClassIds?: string[] }
    ) => {
      storeUpdateTeacher(id, { firstName: data.firstName, lastName: data.lastName, phone: data.phone });
      if (data.assignedClassIds !== undefined) {
        // Sync demo assignments: unassign all current, then assign selected
        const current = storeTeacherClassAssignments.filter((a) => a.teacherId === id);
        current.forEach((a) => storeUnassignTeacherFromClass(id, a.classId));
        data.assignedClassIds.forEach((classId) => storeAssignTeacherToClass(id, classId));
      }
    },
    [storeUpdateTeacher, storeTeacherClassAssignments, storeAssignTeacherToClass, storeUnassignTeacherFromClass]
  );

  // Build demo assignments map
  const demoAssignmentsMap: Record<string, string[]> = {};
  for (const a of storeTeacherClassAssignments) {
    if (!demoAssignmentsMap[a.teacherId]) demoAssignmentsMap[a.teacherId] = [];
    demoAssignmentsMap[a.teacherId].push(a.classId);
  }

  return {
    teachers: isDemo ? storeTeachers : sbTeachers,
    classes: isDemo ? storeClasses : sbClasses,
    teacherAssignedClassIds: isDemo ? demoAssignmentsMap : sbAssignments,
    loading,
    error,
    canAddManually: isDemo,
    refetch: fetchFromSupabase,
    updateTeacher: isDemo ? updateTeacherDemo : updateTeacherReal,
  };
}
