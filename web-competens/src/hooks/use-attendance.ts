import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Classe, Student, AttendanceStatus, DailyAttendanceInput } from "@/types";

export interface UseAttendanceReturn {
  classes: Classe[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getStudentsForClass: (classId: string) => Student[];
  /** Map of studentId → AttendanceStatus for the currently loaded class+date */
  attendanceMap: Record<string, AttendanceStatus>;
  attendanceLoading: boolean;
  loadAttendance: (classId: string, date: string) => Promise<void>;
  saveAttendance: (classId: string, date: string, inputs: DailyAttendanceInput[]) => Promise<void>;
}

export function useAttendance(): UseAttendanceReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // ── Demo store selectors ──────────────────────────────────
  const storeClasses = useAppStore((s) => s.classes);
  const storeStudents = useAppStore((s) => s.students);
  const storeAttendance = useAppStore((s) => s.attendance);
  const storeSaveAttendance = useAppStore((s) => s.saveDemoAttendance);
  const storeAssignments = useAppStore((s) => s.teacherClassAssignments);

  // ── Supabase state ────────────────────────────────────────
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded attendance for current (classId, date) selection
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      let classIds: string[] = [];
      if (user?.role === "professeur") {
        const { data: asgn } = await supabase
          .from("teacher_class_assignments")
          .select("class_id")
          .eq("teacher_id", user.id);
        classIds = (asgn ?? []).map((a) => a.class_id);
        if (classIds.length === 0) {
          setSbClasses([]); setSbStudents([]); setLoading(false); return;
        }
      }

      let classQ = supabase.from("classes").select("*").eq("is_archived", false).order("name");
      if (user?.role === "professeur") classQ = classQ.in("id", classIds);

      const [classesRes] = await Promise.all([classQ]);
      if (classesRes.error) throw classesRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "",
        capacity: c.capacity, studentCount: c.student_count,
        isArchived: c.is_archived, schoolYearId: c.school_year_id, createdAt: c.created_at,
      }));
      setSbClasses(classes);

      const allClassIds = classes.map((c) => c.id);
      if (allClassIds.length > 0) {
        const { data: stuData, error: stuErr } = await supabase
          .from("students")
          .select("*")
          .in("class_id", allClassIds)
          .eq("is_archived", false)
          .order("last_name");
        if (stuErr) throw stuErr;
        setSbStudents((stuData ?? []).map((s) => ({
          id: s.id, firstName: s.first_name, lastName: s.last_name,
          birthDate: s.birth_date ?? "", gender: (s.gender ?? "M") as "M" | "F",
          classId: s.class_id ?? "", photoUrl: s.photo_url ?? undefined, createdAt: s.created_at,
        })));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Load attendance for a specific class + date ───────────

  const loadAttendanceReal = useCallback(async (classId: string, date: string) => {
    if (!supabase) return;
    setAttendanceLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId)
        .eq("date", date);
      if (err) throw err;
      const map: Record<string, AttendanceStatus> = {};
      for (const row of data ?? []) map[row.student_id] = row.status as AttendanceStatus;
      setAttendanceMap(map);
    } catch {
      setAttendanceMap({});
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  const loadAttendanceDemo = useCallback(async (classId: string, date: string) => {
    const map: Record<string, AttendanceStatus> = {};
    for (const a of storeAttendance) {
      if (a.classId === classId && a.date === date) map[a.studentId] = a.status;
    }
    setAttendanceMap(map);
  }, [storeAttendance]);

  // ── Save attendance (upsert) ──────────────────────────────

  const saveAttendanceReal = useCallback(async (classId: string, date: string, inputs: DailyAttendanceInput[]) => {
    if (!supabase || inputs.length === 0) return;
    const now = new Date().toISOString();
    const rows = inputs.map((i) => ({
      student_id: i.studentId,
      class_id: classId,
      teacher_id: user?.id ?? null,
      date,
      status: i.status,
      updated_at: now,
    }));
    const { error: err } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "student_id,date" });
    if (err) throw new Error(err.message);
    await loadAttendanceReal(classId, date);
  }, [user?.id, loadAttendanceReal]);

  const saveAttendanceDemo = useCallback(async (classId: string, date: string, inputs: DailyAttendanceInput[]) => {
    storeSaveAttendance(classId, date, inputs, user?.id ?? "");
    await loadAttendanceDemo(classId, date);
  }, [storeSaveAttendance, user?.id, loadAttendanceDemo]);

  // ── Helpers ───────────────────────────────────────────────

  const getStudentsForClassReal = useCallback(
    (classId: string) => sbStudents.filter((s) => s.classId === classId),
    [sbStudents]
  );

  const getStudentsForClassDemo = useCallback((classId: string) => {
    // In demo, teachers see all classes; filter by classId
    let students = storeStudents.filter((s) => s.classId === classId);
    // Optionally filter if teacher role (use assignments)
    if (user?.role === "professeur") {
      const assignedClassIds = storeAssignments.filter((a) => a.teacherId === user.id).map((a) => a.classId);
      if (!assignedClassIds.includes(classId)) return [];
    }
    return students;
  }, [storeStudents, storeAssignments, user?.role, user?.id]);

  const demoClasses = storeClasses.filter((c) => {
    if (c.isArchived) return false;
    if (user?.role === "professeur") {
      return storeAssignments.some((a) => a.teacherId === user.id && a.classId === c.id);
    }
    return true;
  });

  return {
    classes: isDemo ? demoClasses : sbClasses,
    loading,
    error,
    refetch: fetchFromSupabase,
    getStudentsForClass: isDemo ? getStudentsForClassDemo : getStudentsForClassReal,
    attendanceMap,
    attendanceLoading,
    loadAttendance: isDemo ? loadAttendanceDemo : loadAttendanceReal,
    saveAttendance: isDemo ? saveAttendanceDemo : saveAttendanceReal,
  };
}
