import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Classe, Student, Competency, EvaluationStatus, Level, DailyEvaluationInput } from "@/types";

function splitFullName(n: string) {
  const p = (n ?? "").trim().split(" ");
  return p.length === 1 ? { firstName: p[0], lastName: "" } : { firstName: p[0], lastName: p.slice(1).join(" ") };
}

export interface UseEvaluationReturn {
  classes: Classe[];
  levels: Level[];
  competencies: Competency[];
  loading: boolean;
  error: string | null;
  getStudentsForClass: (classId: string) => Student[];
  getTodayEvals: (classId: string, competencyId: string) => Record<string, EvaluationStatus>;
  saveDailyEvaluation: (classId: string, competencyId: string, evals: DailyEvaluationInput[]) => Promise<void>;
}

export function useEvaluation(): UseEvaluationReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // Store selectors (always called)
  const storeClasses = useAppStore((s) => s.classes);
  const storeLevels = useAppStore((s) => s.levels);
  const storeStudents = useAppStore((s) => s.students);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeSave = useAppStore((s) => s.saveDailyEvaluation);

  // Supabase state
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbLevels, setSbLevels] = useState<Level[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [sbTodayEvals, setSbTodayEvals] = useState<Record<string, Record<string, EvaluationStatus>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      // For professeur: only classes from teacher_class_assignments
      // For admin/directeur: all classes
      let classIds: string[] = [];
      if (user?.role === "professeur") {
        const { data: assignments } = await supabase
          .from("teacher_class_assignments")
          .select("class_id")
          .eq("teacher_id", user.id);
        classIds = (assignments ?? []).map((a) => a.class_id);
      }

      // If teacher has no assignments, skip heavy queries
      if (user?.role === "professeur" && classIds.length === 0) {
        setSbClasses([]); setSbLevels([]); setSbStudents([]); setSbCompetencies([]);
        setLoading(false); return;
      }

      let classesQuery = supabase.from("classes").select("*").eq("is_archived", false).order("name");
      if (user?.role === "professeur") classesQuery = classesQuery.in("id", classIds);

      const [classesRes, levelsRes, competenciesRes] = await Promise.all([
        classesQuery,
        supabase.from("levels").select("*").eq("is_archived", false).order("name"),
        supabase.from("competencies").select("*").order("order"),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (levelsRes.error) throw levelsRes.error;
      if (competenciesRes.error) throw competenciesRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "",
        capacity: c.capacity,
        studentCount: c.student_count, isArchived: c.is_archived,
        schoolYearId: c.school_year_id, createdAt: c.created_at,
      }));

      const levels: Level[] = (levelsRes.data ?? []).map((l) => ({
        id: l.id, name: l.name, code: l.code,
        isArchived: l.is_archived, createdAt: l.created_at,
      }));

      const competencies: Competency[] = (competenciesRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, createdAt: c.created_at,
      }));

      // Fetch all students for these classes
      const allClassIds = classes.map((c) => c.id);
      let students: Student[] = [];
      if (allClassIds.length > 0) {
        const { data: stuData, error: stuErr } = await supabase
          .from("students")
          .select("*")
          .in("class_id", allClassIds)
          .order("last_name");
        if (stuErr) throw stuErr;
        students = (stuData ?? []).map((s) => ({
          id: s.id, firstName: s.first_name, lastName: s.last_name,
          birthDate: s.birth_date ?? "", gender: (s.gender ?? "M") as "M" | "F",
          classId: s.class_id ?? "", photoUrl: s.photo_url ?? undefined,
          createdAt: s.created_at,
        }));
      }

      // Fetch today's evaluations for these classes
      let todayMap: Record<string, Record<string, EvaluationStatus>> = {};
      if (allClassIds.length > 0) {
        const { data: evalData } = await supabase
          .from("evaluations")
          .select("student_id, competency_id, status")
          .in("class_id", allClassIds)
          .eq("date", today);

        for (const e of evalData ?? []) {
          const key = `${e.student_id}__${e.competency_id}`;
          if (!todayMap[key]) todayMap[key] = {};
          todayMap[e.competency_id] = todayMap[e.competency_id] ?? {};
          // Store as compKey -> studentId -> status
          if (!todayMap[e.competency_id]) todayMap[e.competency_id] = {};
        }

        // Rebuild as { `classId_competencyId` -> { studentId -> status } }
        todayMap = {};
        for (const e of evalData ?? []) {
          const key = e.competency_id;
          if (!todayMap[key]) todayMap[key] = {};
          todayMap[key][e.student_id] = e.status as EvaluationStatus;
        }
      }

      setSbClasses(classes);
      setSbLevels(levels);
      setSbStudents(students);
      setSbCompetencies(competencies);
      setSbTodayEvals(todayMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, today]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Get students for a class ──────────────────────────────

  const getStudentsDemo = useCallback(
    (classId: string) => storeStudents.filter((s) => s.classId === classId),
    [storeStudents]
  );
  const getStudentsReal = useCallback(
    (classId: string) => sbStudents.filter((s) => s.classId === classId),
    [sbStudents]
  );

  // ── Get today's evals ─────────────────────────────────────

  const getTodayEvalsDemo = useCallback(
    (classId: string, competencyId: string): Record<string, EvaluationStatus> => {
      const map: Record<string, EvaluationStatus> = {};
      storeEvaluations
        .filter((e) => e.classId === classId && e.competencyId === competencyId && e.date === today)
        .forEach((e) => { map[e.studentId] = e.status; });
      return map;
    },
    [storeEvaluations, today]
  );

  const getTodayEvalsReal = useCallback(
    (_classId: string, competencyId: string): Record<string, EvaluationStatus> => {
      return sbTodayEvals[competencyId] ?? {};
    },
    [sbTodayEvals]
  );

  // ── Save evaluation ───────────────────────────────────────

  const saveDemoEval = useCallback(
    async (classId: string, competencyId: string, evals: DailyEvaluationInput[]) => {
      storeSave(classId, competencyId, evals);
    },
    [storeSave]
  );

  const saveRealEval = useCallback(
    async (classId: string, competencyId: string, evals: DailyEvaluationInput[]) => {
      if (!supabase) throw new Error("Supabase non disponible");
      if (evals.length === 0) return;

      const studentIds = evals.map((e) => e.studentId);

      // Delete existing for today (then re-insert — clean upsert)
      await supabase
        .from("evaluations")
        .delete()
        .eq("class_id", classId)
        .eq("competency_id", competencyId)
        .eq("date", today)
        .in("student_id", studentIds);

      const rows = evals.map((e) => ({
        student_id: e.studentId,
        competency_id: e.competencyId,
        teacher_id: user?.id ?? null,
        class_id: classId,
        status: e.status,
        date: today,
      }));

      const { error: err } = await supabase.from("evaluations").insert(rows);
      if (err) throw new Error(err.message);

      // Refresh today's evals
      const { data } = await supabase
        .from("evaluations")
        .select("student_id, competency_id, status")
        .in("class_id", [classId])
        .eq("date", today);

      const updated: Record<string, Record<string, EvaluationStatus>> = { ...sbTodayEvals };
      for (const e of data ?? []) {
        if (!updated[e.competency_id]) updated[e.competency_id] = {};
        updated[e.competency_id][e.student_id] = e.status as EvaluationStatus;
      }
      setSbTodayEvals(updated);
    },
    [user?.id, today, sbTodayEvals]
  );

  return {
    classes: isDemo ? storeClasses.filter((c) => !c.isArchived) : sbClasses,
    levels: isDemo ? storeLevels : sbLevels,
    competencies: isDemo ? storeCompetencies : sbCompetencies,
    loading,
    error,
    getStudentsForClass: isDemo ? getStudentsDemo : getStudentsReal,
    getTodayEvals: isDemo ? getTodayEvalsDemo : getTodayEvalsReal,
    saveDailyEvaluation: isDemo ? saveDemoEval : saveRealEval,
  };
}
