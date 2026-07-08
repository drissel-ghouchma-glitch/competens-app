import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";

export interface HonorRollStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  average: number;
}

export interface ClassSuccessStat {
  classId: string;
  className: string;
  honoredCount: number;
  totalStudents: number;
  rate: number;
}

export interface TeacherActivityStat {
  teacherId: string;
  teacherName: string;
  count: number;
}

export interface HonorRollClass {
  id: string;
  name: string;
}

interface RawPenalty {
  studentId: string;
  competencyId: string;
  teacherId: string | null;
}

const HONOR_THRESHOLD = 90;

function computeHonorRoll(
  students: { id: string; firstName: string; lastName: string; classId: string }[],
  classes: HonorRollClass[],
  competencyIds: string[],
  penalties: RawPenalty[],
): { honorRoll: HonorRollStudent[]; classStats: ClassSuccessStat[] } {
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const penaltyCountByKey = new Map<string, number>();
  for (const p of penalties) {
    const key = `${p.studentId}__${p.competencyId}`;
    penaltyCountByKey.set(key, (penaltyCountByKey.get(key) ?? 0) + 1);
  }

  const allAverages = students.map((s) => {
    const scores = competencyIds.map((cid) => {
      const count = penaltyCountByKey.get(`${s.id}__${cid}`) ?? 0;
      return Math.max(0, 100 - count);
    });
    const average = scores.length > 0
      ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
      : 0;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      classId: s.classId,
      className: classNameById.get(s.classId) ?? "—",
      average,
    };
  });

  const honorRoll = allAverages
    .filter((s) => s.average >= HONOR_THRESHOLD)
    .sort((a, b) => b.average - a.average);

  const classStats: ClassSuccessStat[] = classes
    .map((c) => {
      const classStudents = allAverages.filter((s) => s.classId === c.id);
      const totalStudents = classStudents.length;
      const honoredCount = classStudents.filter((s) => s.average >= HONOR_THRESHOLD).length;
      const rate = totalStudents > 0 ? Math.round((honoredCount / totalStudents) * 100) : 0;
      return { classId: c.id, className: c.name, honoredCount, totalStudents, rate };
    })
    .filter((c) => c.totalStudents > 0)
    .sort((a, b) => b.rate - a.rate);

  return { honorRoll, classStats };
}

function computeTeacherActivity(
  penalties: RawPenalty[],
  teacherNameById: Map<string, string>,
): TeacherActivityStat[] {
  const counts = new Map<string, number>();
  for (const p of penalties) {
    if (!p.teacherId) continue;
    counts.set(p.teacherId, (counts.get(p.teacherId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([teacherId, count]) => ({
      teacherId,
      teacherName: teacherNameById.get(teacherId) ?? teacherId,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface UseHonorRollReturn {
  classes: HonorRollClass[];
  honorRoll: HonorRollStudent[];
  classStats: ClassSuccessStat[];
  teacherStats: TeacherActivityStat[];
  loading: boolean;
  error: string | null;
}

export function useHonorRoll(): UseHonorRollReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // ── Demo selectors ───────────────────────────────────────
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeTeachers = useAppStore((s) => s.teachers);

  const demoClasses = useMemo<HonorRollClass[]>(
    () => storeClasses.filter((c) => !c.isArchived).map((c) => ({ id: c.id, name: c.name })),
    [storeClasses]
  );
  const demoCompetencyIds = useMemo(
    () => storeCompetencies.filter((c) => !c.isArchived).map((c) => c.id),
    [storeCompetencies]
  );
  const demoPenalties = useMemo<RawPenalty[]>(
    () => storeEvaluations.map((e) => ({
      studentId: e.studentId, competencyId: e.competencyId, teacherId: e.teacherId,
    })),
    [storeEvaluations]
  );
  const demoTeacherNameById = useMemo(
    () => new Map(storeTeachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()])),
    [storeTeachers]
  );
  const demoResult = useMemo(
    () => computeHonorRoll(storeStudents, demoClasses, demoCompetencyIds, demoPenalties),
    [storeStudents, demoClasses, demoCompetencyIds, demoPenalties]
  );
  const demoTeacherStats = useMemo(
    () => computeTeacherActivity(demoPenalties, demoTeacherNameById),
    [demoPenalties, demoTeacherNameById]
  );

  // ── Supabase state ───────────────────────────────────────
  const [sbClasses, setSbClasses] = useState<HonorRollClass[]>([]);
  const [sbHonorRoll, setSbHonorRoll] = useState<HonorRollStudent[]>([]);
  const [sbClassStats, setSbClassStats] = useState<ClassSuccessStat[]>([]);
  const [sbTeacherStats, setSbTeacherStats] = useState<TeacherActivityStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, classesRes, compRes, evalsRes, teachersRes] = await Promise.all([
        supabase.from("students").select("id, first_name, last_name, class_id").eq("is_archived", false),
        supabase.from("classes").select("id, name").eq("is_archived", false).order("name"),
        supabase.from("competencies").select("id").eq("is_archived", false),
        supabase.from("evaluations").select("student_id, competency_id, teacher_id"),
        supabase.from("profiles").select("id, full_name").eq("role", "professeur"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (classesRes.error) throw classesRes.error;
      if (compRes.error) throw compRes.error;
      if (evalsRes.error) throw evalsRes.error;

      const students = (studentsRes.data ?? []).map((s) => ({
        id: s.id, firstName: s.first_name, lastName: s.last_name, classId: s.class_id ?? "",
      }));
      const classes: HonorRollClass[] = (classesRes.data ?? []).map((c) => ({ id: c.id, name: c.name }));
      const competencyIds = (compRes.data ?? []).map((c) => c.id);
      const penalties: RawPenalty[] = (evalsRes.data ?? []).map((e) => ({
        studentId: e.student_id, competencyId: e.competency_id, teacherId: e.teacher_id,
      }));
      const teacherNameById = new Map(
        (teachersRes.data ?? []).map((t) => [t.id, t.full_name || t.id])
      );

      const { honorRoll, classStats } = computeHonorRoll(students, classes, competencyIds, penalties);
      const teacherStats = computeTeacherActivity(penalties, teacherNameById);

      setSbClasses(classes);
      setSbHonorRoll(honorRoll);
      setSbClassStats(classStats);
      setSbTeacherStats(teacherStats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  if (isDemo) {
    return {
      classes: demoClasses,
      honorRoll: demoResult.honorRoll,
      classStats: demoResult.classStats,
      teacherStats: demoTeacherStats,
      loading: false,
      error: null,
    };
  }

  return {
    classes: sbClasses,
    honorRoll: sbHonorRoll,
    classStats: sbClassStats,
    teacherStats: sbTeacherStats,
    loading,
    error,
  };
}
