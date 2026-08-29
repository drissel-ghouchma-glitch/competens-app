import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { isMissingSkillRecoveryTable } from "@/lib/skill-recovery";
import { competencyScoreFromLedger, scoreToStatus, type PenaltyLedgerEvent } from "@/lib/eval-utils";
import type { Classe, Student, Competency, Level, DailyEvaluationInput, SkillRecoveryAction, StudentEvalInfo } from "@/types";

export interface UseEvaluationReturn {
  classes: Classe[];
  levels: Level[];
  competencies: Competency[];
  loading: boolean;
  error: string | null;
  getStudentsForClass: (classId: string) => Student[];
  /** Returns per-student { score, lockedByMe } for the selected class+competency. */
  getEvalInfo: (classId: string, competencyId: string) => Record<string, StudentEvalInfo>;
  /** Inserts penalty rows for the given student IDs (those with pending deductions). */
  saveDailyEvaluation: (classId: string, competencyId: string, penalizedStudentIds: string[]) => Promise<void>;
}

export function useEvaluation(): UseEvaluationReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // ── Demo store selectors (always called) ─────────────────
  const storeClasses = useAppStore((s) => s.classes);
  const storeSchoolYears = useAppStore((s) => s.schoolYears);
  const storeLevels = useAppStore((s) => s.levels);
  const storeStudents = useAppStore((s) => s.students);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeRecoveries = useAppStore((s) => s.skillRecoveryActions);
  const storeSave = useAppStore((s) => s.saveDailyEvaluation);

  // ── Supabase state ────────────────────────────────────────
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbLevels, setSbLevels] = useState<Level[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  // key = `studentId__competencyId` → penalty count (all-time, all teachers)
  const [sbPenalties, setSbPenalties] = useState<PenaltyLedgerEvent[]>([]);
  const [sbRecoveries, setSbRecoveries] = useState<SkillRecoveryAction[]>([]);
  // keys locked today by the current teacher
  const [sbLockedToday, setSbLockedToday] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const demoActiveYearId = useMemo(
    () => storeSchoolYears.find((year) => year.isActive && !year.isClosed)?.id,
    [storeSchoolYears],
  );
  const demoClasses = useMemo(
    () => storeClasses.filter((classe) => !classe.isArchived && classe.schoolYearId === demoActiveYearId),
    [storeClasses, demoActiveYearId],
  );

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
        setSbClasses([]); setSbLevels([]); setSbStudents([]); setSbCompetencies([]); setSbPenalties([]); setSbRecoveries([]);
        return;
      }

      let classIds: string[] = [];
      if (user?.role === "professeur") {
        const { data: assignments } = await supabase
          .from("teacher_class_assignments")
          .select("class_id")
          .eq("teacher_id", user.id);
        classIds = (assignments ?? []).map((a) => a.class_id);
      }

      if (user?.role === "professeur" && classIds.length === 0) {
        setSbClasses([]); setSbLevels([]); setSbStudents([]); setSbCompetencies([]); setSbPenalties([]); setSbRecoveries([]);
        setLoading(false); return;
      }

      let classesQuery = supabase.from("classes").select("*").eq("is_archived", false).eq("school_year_id", activeYear.id).order("name");
      if (user?.role === "professeur") classesQuery = classesQuery.in("id", classIds);

      const [classesRes, levelsRes, competenciesRes] = await Promise.all([
        classesQuery,
        supabase.from("levels").select("*").eq("is_archived", false).order("name"),
        // Archived competencies are excluded from the teacher grid.
        supabase.from("competencies").select("*").eq("is_archived", false).order("order"),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (levelsRes.error) throw levelsRes.error;
      if (competenciesRes.error) throw competenciesRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "",
        capacity: c.capacity, studentCount: c.student_count,
        isArchived: c.is_archived, schoolYearId: c.school_year_id, createdAt: c.created_at,
      }));

      const levels: Level[] = (levelsRes.data ?? []).map((l) => ({
        id: l.id, name: l.name, code: l.code,
        isArchived: l.is_archived, createdAt: l.created_at,
      }));

      const competencies: Competency[] = (competenciesRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, isArchived: c.is_archived ?? false, createdAt: c.created_at,
      }));

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

      setSbClasses(classes);
      setSbLevels(levels);
      setSbStudents(students);
      setSbCompetencies(competencies);

      // Pre-fetch penalty counts for all students
      if (students.length > 0) {
        const allStudentIds = students.map((s) => s.id);

        const [penaltyRes, recoveryRes, lockRes] = await Promise.all([
          supabase.from("evaluations").select("student_id, competency_id, date, created_at").in("student_id", allStudentIds).in("class_id", allClassIds),
          supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at").in("student_id", allStudentIds).in("class_id", allClassIds),
          user?.id
            ? supabase.from("evaluations").select("student_id, competency_id")
                .in("student_id", allStudentIds).in("class_id", allClassIds).eq("date", today).eq("teacher_id", user.id)
            : Promise.resolve({ data: [] as { student_id: string; competency_id: string }[] }),
        ]);

        if (penaltyRes.error) throw penaltyRes.error;
        if (recoveryRes.error && !isMissingSkillRecoveryTable(recoveryRes.error)) throw recoveryRes.error;
        setSbPenalties((penaltyRes.data ?? []).map((row) => ({
          studentId: row.student_id, competencyId: row.competency_id, date: row.date, createdAt: row.created_at,
        })));
        setSbRecoveries(recoveryRes.error ? [] : (recoveryRes.data ?? []).map((row) => ({
          id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
          actionType: row.action_type as "increase" | "reset_to_100", previousScore: row.previous_score, newScore: row.new_score,
          meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
          createdBy: row.created_by, createdAt: row.created_at,
        })));

        const locked = new Set(
          ((lockRes as { data: { student_id: string; competency_id: string }[] | null }).data ?? [])
            .map((r) => `${r.student_id}__${r.competency_id}`)
        );
        setSbLockedToday(locked);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, today]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Get students ──────────────────────────────────────────

  const getStudentsDemo = useCallback(
    (classId: string) => storeStudents.filter((s) => s.classId === classId),
    [storeStudents]
  );
  const getStudentsReal = useCallback(
    (classId: string) => sbStudents.filter((s) => s.classId === classId),
    [sbStudents]
  );

  // ── Get eval info ─────────────────────────────────────────

  const getEvalInfoDemo = useCallback(
    (classId: string, competencyId: string): Record<string, StudentEvalInfo> => {
      const classStudents = storeStudents.filter((s) => s.classId === classId);
      const result: Record<string, StudentEvalInfo> = {};
      for (const student of classStudents) {
        const penalties = storeEvaluations.filter(
          (e) => e.studentId === student.id && e.competencyId === competencyId && e.classId === classId
        );
        const todayByMe = storeEvaluations.filter(
          (e) => e.studentId === student.id && e.competencyId === competencyId &&
                 e.classId === classId && e.date === today && e.teacherId === (user?.id ?? "")
        );
        result[student.id] = {
          score: competencyScoreFromLedger(
            penalties,
            storeRecoveries.filter((action) => action.classId === classId),
            student.id,
            competencyId,
          ),
          lockedByMe: todayByMe.length > 0,
        };
      }
      return result;
    },
    [storeStudents, storeEvaluations, storeRecoveries, today, user?.id]
  );

  const getEvalInfoReal = useCallback(
    (classId: string, competencyId: string): Record<string, StudentEvalInfo> => {
      const classStudents = sbStudents.filter((s) => s.classId === classId);
      const result: Record<string, StudentEvalInfo> = {};
      for (const student of classStudents) {
        result[student.id] = {
          score: competencyScoreFromLedger(sbPenalties, sbRecoveries, student.id, competencyId),
          lockedByMe: sbLockedToday.has(`${student.id}__${competencyId}`),
        };
      }
      return result;
    },
    [sbStudents, sbPenalties, sbRecoveries, sbLockedToday]
  );

  // ── Save evaluation ───────────────────────────────────────

  const saveDemoEval = useCallback(
    async (classId: string, competencyId: string, penalizedStudentIds: string[]) => {
      const inputs: DailyEvaluationInput[] = penalizedStudentIds.map((studentId) => ({
        studentId,
        competencyId,
      }));
      storeSave(classId, competencyId, inputs);
    },
    [storeSave]
  );

  const checkThresholdAlerts = useCallback(
    async (competencyId: string, studentIds: string[]) => {
      if (!supabase) return;
      const competency = sbCompetencies.find((c) => c.id === competencyId);
      if (!competency) return;

      for (const studentId of studentIds) {
        try {
          const student = sbStudents.find((item) => item.id === studentId);
          if (!student?.classId) continue;
          const [penaltyRes, recoveryRes] = await Promise.all([
            supabase.from("evaluations").select("student_id, competency_id, date, created_at").eq("student_id", studentId).eq("competency_id", competencyId).eq("class_id", student.classId),
            supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at").eq("student_id", studentId).eq("competency_id", competencyId).eq("class_id", student.classId),
          ]);
          if (penaltyRes.error || (recoveryRes.error && !isMissingSkillRecoveryTable(recoveryRes.error))) continue;
          const score = competencyScoreFromLedger(
            (penaltyRes.data ?? []).map((row) => ({ studentId: row.student_id, competencyId: row.competency_id, date: row.date, createdAt: row.created_at })),
            recoveryRes.error ? [] : (recoveryRes.data ?? []).map((row) => ({
              id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
              actionType: row.action_type as "increase" | "reset_to_100", previousScore: row.previous_score, newScore: row.new_score,
              meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
              createdBy: row.created_by, createdAt: row.created_at,
            })),
            studentId,
            competencyId,
          );

          // Trigger alerts at 91/100 (−9 points) and at ≤50 (Non acquis)
          if (score !== 91 && score > 50) continue;

          const studentName = student ? `${student.firstName} ${student.lastName}` : studentId;

          // Avoid duplicate alerts today for the same student+competency
          const { data: existing } = await supabase
            .from("alerts")
            .select("id")
            .eq("student_id", studentId)
            .eq("date", today)
            .ilike("cause", `%${competency.code}%`)
            .limit(1);
          if (existing && existing.length > 0) continue;

          const level = score <= 50 ? "critical" : "warning";
          const cause = score === 91
            ? `Alerte : ${studentName} a atteint 91/100 en ${competency.code} — ${competency.title} (−9 points).`
            : `Alerte critique : ${studentName} a chuté à ${score}/100 en ${competency.code} — ${competency.title} (${scoreToStatus(score) === "non_acquis" ? "Non acquis" : "En cours"}).`;

          await supabase.from("alerts").insert({
            student_id: studentId,
            level,
            cause,
            date: today,
            resolved: false,
          });
        } catch {
          // best-effort — never block the save
        }
      }
    },
    [sbCompetencies, sbStudents, today]
  );

  const saveRealEval = useCallback(
    async (classId: string, competencyId: string, penalizedStudentIds: string[]) => {
      if (!supabase) throw new Error("Supabase non disponible");
      if (penalizedStudentIds.length === 0) return;

      const rows = penalizedStudentIds.map((studentId) => ({
        student_id: studentId,
        competency_id: competencyId,
        teacher_id: user?.id ?? null,
        class_id: classId,
        date: today,
      }));

      const { error: err } = await supabase.from("evaluations").insert(rows);
      if (err) throw new Error(err.message);

      // Add the new immutable penalty events to the local ledger immediately.
      const createdAt = new Date().toISOString();
      setSbPenalties((prev) => [
        ...prev,
        ...penalizedStudentIds.map((studentId) => ({
          studentId, competencyId, date: today, createdAt,
        })),
      ]);
      setSbLockedToday((prev) => {
        const next = new Set(prev);
        for (const studentId of penalizedStudentIds) {
          next.add(`${studentId}__${competencyId}`);
        }
        return next;
      });

      await checkThresholdAlerts(competencyId, penalizedStudentIds);
    },
    [user?.id, today, checkThresholdAlerts]
  );

  return {
    classes: isDemo ? demoClasses : sbClasses,
    levels: isDemo ? storeLevels : sbLevels,
    competencies: isDemo ? storeCompetencies.filter((c) => !c.isArchived) : sbCompetencies,
    loading,
    error,
    getStudentsForClass: isDemo ? getStudentsDemo : getStudentsReal,
    getEvalInfo: isDemo ? getEvalInfoDemo : getEvalInfoReal,
    saveDailyEvaluation: isDemo ? saveDemoEval : saveRealEval,
  };
}

// Keep a re-export of the old name for any remaining callers that might use it.
export type { StudentEvalInfo };
