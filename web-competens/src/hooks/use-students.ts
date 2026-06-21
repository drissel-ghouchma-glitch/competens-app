import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Student, Classe } from "@/types";

type AddStudentInput = Omit<Student, "id" | "createdAt">;
type ImportRow = { firstName: string; lastName: string; birthDate: string; gender: "M" | "F"; classId: string };

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
  importStudents: (rows: ImportRow[]) => Promise<ImportResult>;
  deleteStudent: (id: string) => Promise<void>;
}

async function syncClassStudentCount(classId: string) {
  if (!supabase || !classId) return;
  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId);
  await supabase
    .from("classes")
    .update({ student_count: count ?? 0 })
    .eq("id", classId);
}

export function useStudents(): UseStudentsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Always call store hooks (React rules of hooks)
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeAddStudent = useAppStore((s) => s.addStudent);
  const storeImportStudents = useAppStore((s) => s.importStudents);
  const storeDeleteStudent = useAppStore((s) => s.deleteStudent);

  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, classesRes] = await Promise.all([
        supabase.from("students").select("*").order("last_name"),
        supabase.from("classes").select("*").eq("is_archived", false).order("name"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (classesRes.error) throw classesRes.error;

      const students: Student[] = (studentsRes.data ?? []).map((s) => ({
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        birthDate: s.birth_date ?? "",
        gender: (s.gender ?? "M") as "M" | "F",
        classId: s.class_id ?? "",
        photoUrl: s.photo_url ?? undefined,
        createdAt: s.created_at,
      }));

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

      setSbStudents(students);
      setSbClasses(classes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des élèves");
    } finally {
      setLoading(false);
    }
  }, []);

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
    async (rows: ImportRow[]): Promise<ImportResult> => {
      if (!supabase || rows.length === 0) return { succeeded: 0, failed: [] };

      const result: ImportResult = { succeeded: 0, failed: [] };

      // Insert one by one so a duplicate / bad date doesn't abort the whole batch
      for (const r of rows) {
        const { error: err } = await supabase.from("students").insert({
          first_name: r.firstName,
          last_name: r.lastName,
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

      // Sync student counts for all affected classes
      const classIds = [...new Set(rows.map((r) => r.classId).filter(Boolean))];
      await Promise.all(classIds.map(syncClassStudentCount));
      await fetchFromSupabase();
      return result;
    },
    [fetchFromSupabase]
  );

  const deleteStudentReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const student = sbStudents.find((s) => s.id === id);
      const { error: err } = await supabase.from("students").delete().eq("id", id);
      if (err) throw new Error(err.message);
      if (student?.classId) await syncClassStudentCount(student.classId);
      await fetchFromSupabase();
    },
    [sbStudents, fetchFromSupabase]
  );

  // ── Demo CRUD wrappers (async to unify the interface) ────

  const addStudentDemo = useCallback(
    async (data: AddStudentInput) => { storeAddStudent(data); },
    [storeAddStudent]
  );

  const importStudentsDemo = useCallback(
    async (rows: ImportRow[]): Promise<ImportResult> => {
      storeImportStudents(rows);
      return { succeeded: rows.length, failed: [] };
    },
    [storeImportStudents]
  );

  const deleteStudentDemo = useCallback(
    async (id: string) => { storeDeleteStudent(id); },
    [storeDeleteStudent]
  );

  return {
    students: isDemo ? storeStudents : sbStudents,
    classes: isDemo ? storeClasses : sbClasses,
    loading,
    error,
    refetch: fetchFromSupabase,
    addStudent: isDemo ? addStudentDemo : addStudentReal,
    importStudents: isDemo ? importStudentsDemo : importStudentsReal,
    deleteStudent: isDemo ? deleteStudentDemo : deleteStudentReal,
  };
}
