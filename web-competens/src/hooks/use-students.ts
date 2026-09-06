// SQL migration required before archiveStudent works in real mode:
//   ALTER TABLE students ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Student, Classe, StudentImportRow } from "@/types";

type AddStudentInput = Omit<Student, "id" | "createdAt">;

export interface ImportResult {
  succeeded: number;
  failed: { name: string; reason: string }[];
}

export interface UseStudentsReturn {
  students: Student[];
  classes: Classe[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addStudent: (data: AddStudentInput) => Promise<void>;
  importStudents: (rows: StudentImportRow[]) => Promise<ImportResult>;
  moveStudents: (studentIds: string[], targetClassId: string) => Promise<void>;
  archiveStudent: (id: string) => Promise<void>;
}

// Counts only non-archived students for the class student_count column.
async function syncClassStudentCount(classId: string) {
  if (!supabase || !classId) return;
  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("is_archived", false);
  await supabase
    .from("classes")
    .update({ student_count: count ?? 0 })
    .eq("id", classId);
}

export function useStudents(): UseStudentsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeAssignments = useAppStore((s) => s.teacherClassAssignments);
  const storeSchoolYears = useAppStore((s) => s.schoolYears);
  const storeAddStudent = useAppStore((s) => s.addStudent);
  const storeImportStudents = useAppStore((s) => s.importStudents);
  const storeUpdateStudent = useAppStore((s) => s.updateStudent);
  const storeDeleteStudent = useAppStore((s) => s.deleteStudent);
  const demoActiveYearId = useMemo(
    () => storeSchoolYears.find((year) => year.isActive && !year.isClosed)?.id,
    [storeSchoolYears],
  );
  const demoClasses = useMemo(
    () => storeClasses.filter((classe) => {
      if (classe.schoolYearId !== demoActiveYearId || classe.isArchived) return false;
      return user?.role !== "professeur" || storeAssignments.some((assignment) =>
        assignment.teacherId === user.id && assignment.classId === classe.id
      );
    }),
    [storeClasses, demoActiveYearId, storeAssignments, user?.id, user?.role],
  );
  const demoClassIds = useMemo(() => new Set(demoClasses.map((classe) => classe.id)), [demoClasses]);
  const demoStudents = useMemo(
    () => storeStudents.filter((student) => demoClassIds.has(student.classId)),
    [storeStudents, demoClassIds],
  );

  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: activeYear, error: activeYearError } = await supabase
        .from("school_years")
        .select("id")
        .eq("is_active", true)
        .eq("is_closed", false)
        .maybeSingle();
      if (activeYearError) throw activeYearError;
      if (!activeYear) {
        setSbStudents([]); setSbClasses([]); return;
      }
      let assignedClassIds: string[] = [];
      if (user?.role === "professeur") {
        const { data: assignments, error: assignmentsError } = await supabase
          .from("teacher_class_assignments")
          .select("class_id")
          .eq("teacher_id", user.id);
        if (assignmentsError) throw assignmentsError;
        assignedClassIds = (assignments ?? []).map((assignment) => assignment.class_id);
        if (assignedClassIds.length === 0) {
          setSbStudents([]); setSbClasses([]); return;
        }
      }

      let classesQuery = supabase
        .from("classes")
        .select("*")
        .eq("is_archived", false)
        .eq("school_year_id", activeYear.id)
        .order("name");
      if (user?.role === "professeur") classesQuery = classesQuery.in("id", assignedClassIds);

      const classesRes = await classesQuery;
      if (classesRes.error) throw classesRes.error;

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

      const classIds = classes.map((classe) => classe.id);
      const studentsRes = classIds.length === 0
        ? { data: [], error: null }
        : await supabase.from("students").select("*").eq("is_archived", false).in("class_id", classIds).order("last_name");
      if (studentsRes.error) throw studentsRes.error;

      const students: Student[] = (studentsRes.data ?? []).map((s) => ({
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        massarCode: s.massar_code ?? undefined,
        birthDate: s.birth_date ?? "",
        gender: (s.gender ?? "M") as "M" | "F",
        classId: s.class_id ?? "",
        photoUrl: s.photo_url ?? undefined,
        createdAt: s.created_at,
      }));

      setSbStudents(students);
      setSbClasses(classes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des élèves");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real (Supabase) CRUD ─────────────────────────────────

  const addStudentReal = useCallback(
    async (data: AddStudentInput) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const { error: err } = await supabase.from("students").insert({
        first_name: data.firstName,
        last_name: data.lastName,
        massar_code: data.massarCode?.trim() || null,
        birth_date: data.birthDate || null,
        gender: data.gender,
        class_id: data.classId || null,
      });
      if (err) throw new Error(err.message);
      if (data.classId) await syncClassStudentCount(data.classId);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const importStudentsReal = useCallback(
    async (rows: StudentImportRow[]): Promise<ImportResult> => {
      if (!supabase || rows.length === 0) return { succeeded: 0, failed: [] };

      const result: ImportResult = { succeeded: 0, failed: [] };

      for (const r of rows) {
        const { error: err } = await supabase.from("students").insert({
          first_name: r.firstName,
          last_name: r.lastName,
          massar_code: r.massarCode.trim() || null,
          birth_date: r.birthDate || null,
          gender: r.gender,
          class_id: r.classId || null,
        });
        if (err) {
          const reason = err.code === "23505"
            ? "Élève déjà existant (doublon)"
            : err.message;
          result.failed.push({ name: `${r.firstName} ${r.lastName}`, reason });
        } else {
          result.succeeded++;
        }
      }

      const classIds = [...new Set(rows.map((r) => r.classId).filter(Boolean))];
      await Promise.all(classIds.map(syncClassStudentCount));
      await fetchFromSupabase();
      return result;
    },
    [fetchFromSupabase]
  );

  // Soft delete: marks as archived so evaluation history is preserved.
  const archiveStudentReal = useCallback(
    async (id: string) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const student = sbStudents.find((s) => s.id === id);
      const { error: err } = await supabase
        .from("students")
        .update({ is_archived: true })
        .eq("id", id);
      if (err) throw new Error(err.message);
      if (student?.classId) await syncClassStudentCount(student.classId);
      await fetchFromSupabase();
    },
    [sbStudents, fetchFromSupabase]
  );

  const moveStudentsReal = useCallback(
    async (studentIds: string[], targetClassId: string) => {
      if (!supabase || !targetClassId) throw new Error("La classe de destination est requise.");
      const ids = [...new Set(studentIds)].filter((id) => sbStudents.some((student) => student.id === id));
      if (ids.length === 0) return;

      const sourceClassIds = sbStudents
        .filter((student) => ids.includes(student.id) && student.classId !== targetClassId)
        .map((student) => student.classId)
        .filter(Boolean);
      const { error: err } = await supabase
        .from("students")
        .update({ class_id: targetClassId })
        .in("id", ids)
        .eq("is_archived", false);
      if (err) throw new Error(err.message);

      await Promise.all([...new Set([...sourceClassIds, targetClassId])].map(syncClassStudentCount));
      await fetchFromSupabase();
    },
    [sbStudents, fetchFromSupabase]
  );

  // ── Demo wrappers ────────────────────────────────────────

  const addStudentDemo = useCallback(
    async (data: AddStudentInput) => { storeAddStudent(data); },
    [storeAddStudent]
  );

  const importStudentsDemo = useCallback(
    async (rows: StudentImportRow[]): Promise<ImportResult> => {
      storeImportStudents(rows);
      return { succeeded: rows.length, failed: [] };
    },
    [storeImportStudents]
  );

  const archiveStudentDemo = useCallback(
    async (id: string) => { storeDeleteStudent(id); },
    [storeDeleteStudent]
  );

  const moveStudentsDemo = useCallback(
    async (studentIds: string[], targetClassId: string) => {
      for (const id of new Set(studentIds)) storeUpdateStudent(id, { classId: targetClassId });
    },
    [storeUpdateStudent]
  );

  return {
    students: isDemo ? demoStudents : sbStudents,
    classes: isDemo ? demoClasses : sbClasses,
    loading,
    error,
    refetch: fetchFromSupabase,
    addStudent: isDemo ? addStudentDemo : addStudentReal,
    importStudents: isDemo ? importStudentsDemo : importStudentsReal,
    moveStudents: isDemo ? moveStudentsDemo : moveStudentsReal,
    archiveStudent: isDemo ? archiveStudentDemo : archiveStudentReal,
  };
}
