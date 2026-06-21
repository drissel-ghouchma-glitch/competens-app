import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Student, Classe, Level, Competency, Alert, EvaluationStatus } from "@/types";

export interface CompetencyStat {
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  acquisitionRate: number;
  totalEvaluations: number;
  lastStatus: EvaluationStatus;
}

interface RawEval {
  studentId: string;
  competencyId: string;
  teacherId: string;
  status: EvaluationStatus;
  date: string;
}

function computeStats(evals: RawEval[], competencies: Competency[], studentId: string): CompetencyStat[] {
  const studentEvals = evals.filter((e) => e.studentId === studentId);
  return competencies.map((comp) => {
    const ce = studentEvals.filter((e) => e.competencyId === comp.id);
    const total = ce.length;
    const acquired = ce.filter((e) => e.status === "acquis").length;
    const sorted = [...ce].sort((a, b) => a.date.localeCompare(b.date));
    const last: EvaluationStatus = sorted.length > 0 ? sorted[sorted.length - 1].status : "non_acquis";
    return {
      competencyId: comp.id,
      competencyCode: comp.code,
      competencyTitle: comp.title,
      acquisitionRate: total > 0 ? Math.round((acquired / total) * 100) : 0,
      totalEvaluations: total,
      lastStatus: last,
    };
  });
}

export interface UseStudentDetailReturn {
  student: Student | null;
  classe: Classe | null;
  level: Level | null;
  competencies: Competency[];
  /** Stats filtered to the current teacher's evaluations (or all evals for admin/directeur) */
  myStats: CompetencyStat[];
  /** All-teacher stats — only populated for admin/directeur */
  globalStats: CompetencyStat[];
  alerts: Alert[];
  /** Classes list for the edit dropdown (admin only) */
  classes: Classe[];
  loading: boolean;
  error: string | null;
  /** Update student — only available for admin/directeur */
  updateStudent: (data: Partial<Pick<Student, "firstName" | "lastName" | "birthDate" | "gender" | "classId">>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useStudentDetail(studentId: string | undefined): UseStudentDetailReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // ── Demo selectors (always called) ──────────────────────
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeLevels = useAppStore((s) => s.levels);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeAlerts = useAppStore((s) => s.alerts);
  const storeUpdateStudent = useAppStore((s) => s.updateStudent);

  // Compute demo data with useMemo to avoid creating new refs each render
  const demoStudent = useMemo(
    () => storeStudents.find((s) => s.id === studentId) ?? null,
    [storeStudents, studentId]
  );
  const demoClasse = useMemo(
    () => (demoStudent ? storeClasses.find((c) => c.id === demoStudent.classId) ?? null : null),
    [storeClasses, demoStudent]
  );
  const demoLevel = useMemo(
    () => (demoClasse ? storeLevels.find((l) => l.id === demoClasse.levelId) ?? null : null),
    [storeLevels, demoClasse]
  );
  const demoAlerts = useMemo(
    () => storeAlerts.filter((a) => a.studentId === studentId),
    [storeAlerts, studentId]
  );
  const demoRawEvals = useMemo(
    () => storeEvaluations.map((e) => ({
      studentId: e.studentId,
      competencyId: e.competencyId,
      teacherId: e.teacherId,
      status: e.status,
      date: e.date,
    })),
    [storeEvaluations]
  );
  const demoMyEvals = useMemo(
    () => user?.role === "professeur"
      ? demoRawEvals.filter((e) => e.teacherId === user.id)
      : demoRawEvals,
    [demoRawEvals, user?.role, user?.id]
  );
  const demoMyStats = useMemo(
    () => studentId ? computeStats(demoMyEvals, storeCompetencies, studentId) : [],
    [demoMyEvals, storeCompetencies, studentId]
  );
  const demoGlobalStats = useMemo(
    () => (studentId && user?.role !== "professeur")
      ? computeStats(demoRawEvals, storeCompetencies, studentId)
      : [],
    [demoRawEvals, storeCompetencies, studentId, user?.role]
  );

  // ── Supabase state ───────────────────────────────────────
  const [sbStudent, setSbStudent] = useState<Student | null>(null);
  const [sbClasse, setSbClasse] = useState<Classe | null>(null);
  const [sbLevel, setSbLevel] = useState<Level | null>(null);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [sbAlerts, setSbAlerts] = useState<Alert[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbMyEvals, setSbMyEvals] = useState<RawEval[]>([]);
  const [sbAllEvals, setSbAllEvals] = useState<RawEval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sbMyStats = useMemo(
    () => studentId ? computeStats(sbMyEvals, sbCompetencies, studentId) : [],
    [sbMyEvals, sbCompetencies, studentId]
  );
  const sbGlobalStats = useMemo(
    () => (studentId && user?.role !== "professeur")
      ? computeStats(sbAllEvals, sbCompetencies, studentId)
      : [],
    [sbAllEvals, sbCompetencies, studentId, user?.role]
  );

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Student
      const { data: stuData, error: stuErr } = await supabase
        .from("students")
        .select("*")
        .eq("id", studentId)
        .single();
      if (stuErr) throw stuErr;

      const student: Student = {
        id: stuData.id,
        firstName: stuData.first_name,
        lastName: stuData.last_name,
        birthDate: stuData.birth_date ?? "",
        gender: (stuData.gender ?? "M") as "M" | "F",
        classId: stuData.class_id ?? "",
        photoUrl: stuData.photo_url ?? undefined,
        createdAt: stuData.created_at,
      };
      setSbStudent(student);

      // 2. Class + Level + all classes for edit dropdown
      const [classesRes, compRes, alertsRes] = await Promise.all([
        supabase.from("classes").select("*, levels(*)").eq("is_archived", false).order("name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("alerts").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (compRes.error) throw compRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "",
        capacity: c.capacity, studentCount: c.student_count,
        isArchived: c.is_archived, schoolYearId: c.school_year_id,
        createdAt: c.created_at,
      }));
      setSbClasses(classes);

      const studentClass = classes.find((c) => c.id === student.classId) ?? null;
      setSbClasse(studentClass);

      // Level from joined data
      const classRow = (classesRes.data ?? []).find((c) => c.id === student.classId);
      const lvl = classRow?.levels as { id: string; name: string; code: string; is_archived: boolean; created_at: string } | null;
      setSbLevel(lvl ? { id: lvl.id, name: lvl.name, code: lvl.code, isArchived: lvl.is_archived, createdAt: lvl.created_at } : null);

      const competencies: Competency[] = (compRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, createdAt: c.created_at,
      }));
      setSbCompetencies(competencies);

      const alerts: Alert[] = (alertsRes.data ?? []).map((a) => ({
        id: a.id, studentId: a.student_id, level: a.level,
        cause: a.cause, date: a.date, resolved: a.resolved,
        resolvedAt: a.resolved_at ?? undefined, createdAt: a.created_at,
      }));
      setSbAlerts(alerts);

      // 3. Evaluations: for teacher → only their own; for admin → all
      let evalsQuery = supabase
        .from("evaluations")
        .select("student_id, competency_id, teacher_id, status, date")
        .eq("student_id", studentId);

      if (user?.role === "professeur" && user?.id) {
        const { data: myEvData } = await evalsQuery.eq("teacher_id", user.id);
        const myEvals: RawEval[] = (myEvData ?? []).map((e) => ({
          studentId: e.student_id, competencyId: e.competency_id,
          teacherId: e.teacher_id, status: e.status as EvaluationStatus, date: e.date,
        }));
        setSbMyEvals(myEvals);
        setSbAllEvals([]); // not needed for teacher
      } else {
        // admin/directeur: fetch all
        const { data: allEvData } = await evalsQuery;
        const allEvals: RawEval[] = (allEvData ?? []).map((e) => ({
          studentId: e.student_id, competencyId: e.competency_id,
          teacherId: e.teacher_id, status: e.status as EvaluationStatus, date: e.date,
        }));
        setSbAllEvals(allEvals);
        setSbMyEvals(allEvals); // myStats = global for admin
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [studentId, user?.id, user?.role]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Update student (admin/directeur only) ────────────────

  const updateStudentReal = useCallback(
    async (data: Partial<Pick<Student, "firstName" | "lastName" | "birthDate" | "gender" | "classId">>) => {
      if (!supabase || !studentId) return;
      const update: Record<string, unknown> = {};
      if (data.firstName !== undefined) update.first_name = data.firstName;
      if (data.lastName !== undefined) update.last_name = data.lastName;
      if (data.birthDate !== undefined) update.birth_date = data.birthDate || null;
      if (data.gender !== undefined) update.gender = data.gender;
      if (data.classId !== undefined) update.class_id = data.classId || null;
      const { error: err } = await supabase.from("students").update(update).eq("id", studentId);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [studentId, fetchFromSupabase]
  );

  const updateStudentDemo = useCallback(
    async (data: Partial<Pick<Student, "firstName" | "lastName" | "birthDate" | "gender" | "classId">>) => {
      if (studentId) storeUpdateStudent(studentId, data);
    },
    [studentId, storeUpdateStudent]
  );

  return {
    student: isDemo ? demoStudent : sbStudent,
    classe: isDemo ? demoClasse : sbClasse,
    level: isDemo ? demoLevel : sbLevel,
    competencies: isDemo ? storeCompetencies : sbCompetencies,
    myStats: isDemo ? demoMyStats : sbMyStats,
    globalStats: isDemo ? demoGlobalStats : sbGlobalStats,
    alerts: isDemo ? demoAlerts : sbAlerts,
    classes: isDemo ? storeClasses : sbClasses,
    loading,
    error,
    updateStudent: isDemo ? updateStudentDemo : updateStudentReal,
    refetch: fetchFromSupabase,
  };
}
