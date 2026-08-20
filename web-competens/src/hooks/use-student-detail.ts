import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { scoreToStatus, buildTimeline, competencyScoreFromLedger, type PenaltyLedgerEvent, type TimelinePoint } from "@/lib/eval-utils";
import type { Student, Classe, Level, Competency, Alert, EvaluationStatus, AttendanceRecord, AttendanceStatus, AttendancePeriod, SkillRecoveryAction } from "@/types";
import type { DailyEvalRecord, ClassTeacher } from "@/components/DailyGranularAnalytics";
import type { RecoverySubmission } from "@/components/SkillRecoveryDialog";

export type { TimelinePoint, DailyEvalRecord, ClassTeacher };

export interface CompetencyStat {
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  acquisitionRate: number;
  totalEvaluations: number;
  lastStatus: EvaluationStatus;
  isArchived: boolean;
}

// Each record = one penalty event (no status field).
interface RawEval extends PenaltyLedgerEvent {
  id: string;
  studentId: string;
  competencyId: string;
  teacherId: string;
  teacherName: string;
  date: string;
  createdAt: string;
}

function computeStats(penalties: RawEval[], recoveries: SkillRecoveryAction[], competencies: Competency[], studentId: string): CompetencyStat[] {
  const studentPenalties = penalties.filter((p) => p.studentId === studentId);
  return competencies.map((comp) => {
    const cp = studentPenalties.filter((p) => p.competencyId === comp.id);
    const rate = competencyScoreFromLedger(penalties, recoveries, studentId, comp.id);
    return {
      competencyId: comp.id,
      competencyCode: comp.code,
      competencyTitle: comp.title,
      acquisitionRate: rate,
      totalEvaluations: cp.length,
      lastStatus: scoreToStatus(rate),
      isArchived: comp.isArchived ?? false,
    };
  });
}

export interface UseStudentDetailReturn {
  student: Student | null;
  classe: Classe | null;
  level: Level | null;
  competencies: Competency[];
  myStats: CompetencyStat[];
  globalStats: CompetencyStat[];
  alerts: Alert[];
  timeline: TimelinePoint[];
  attendanceHistory: AttendanceRecord[];
  classes: Classe[];
  rawEvals: DailyEvalRecord[];
  recoveryActions: SkillRecoveryAction[];
  classTeachers: ClassTeacher[];
  loading: boolean;
  error: string | null;
  updateStudent: (data: Partial<Pick<Student, "firstName" | "lastName" | "birthDate" | "gender" | "classId">>) => Promise<void>;
  createRecoveryAction: (submission: RecoverySubmission) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useStudentDetail(studentId: string | undefined): UseStudentDetailReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // ── Demo selectors ───────────────────────────────────────
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeLevels = useAppStore((s) => s.levels);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeRecoveries = useAppStore((s) => s.skillRecoveryActions);
  const storeTeachers = useAppStore((s) => s.teachers);
  const storeAlerts = useAppStore((s) => s.alerts);
  const storeAttendance = useAppStore((s) => s.attendance);
  const storeUpdateStudent = useAppStore((s) => s.updateStudent);
  const addDemoRecovery = useAppStore((s) => s.addDemoSkillRecoveryAction);

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
    () => storeEvaluations
      .filter((e) => e.studentId === studentId)
      .map((e) => {
        const t = storeTeachers.find((x) => x.id === e.teacherId);
        return {
          id: e.id,
          studentId: e.studentId,
          competencyId: e.competencyId,
          teacherId: e.teacherId,
          teacherName: t ? `${t.firstName} ${t.lastName}` : "",
          date: e.date,
          createdAt: e.createdAt,
        };
      }),
    [storeEvaluations, storeTeachers, studentId]
  );
  const demoRecoveries = useMemo(
    () => storeRecoveries.filter((action) => action.studentId === studentId),
    [storeRecoveries, studentId]
  );
  const demoMyEvals = useMemo(
    () => user?.role === "professeur"
      ? demoRawEvals.filter((e) => e.teacherId === user.id)
      : demoRawEvals,
    [demoRawEvals, user?.role, user?.id]
  );
  const demoMyStats = useMemo(
    () => studentId ? computeStats(demoMyEvals, user?.role === "professeur" ? [] : demoRecoveries, storeCompetencies, studentId) : [],
    [demoMyEvals, demoRecoveries, storeCompetencies, studentId, user?.role]
  );
  const demoGlobalStats = useMemo(
    () => studentId ? computeStats(demoRawEvals, demoRecoveries, storeCompetencies, studentId) : [],
    [demoRawEvals, demoRecoveries, storeCompetencies, studentId]
  );
  const demoTimeline = useMemo(
    () => studentId ? buildTimeline(demoRawEvals) : [],
    [demoRawEvals, studentId]
  );
  const demoAttendanceHistory = useMemo(
    () => storeAttendance.filter((a) => a.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date)),
    [storeAttendance, studentId]
  );
  const demoClassTeachers = useMemo<ClassTeacher[]>(() => {
    const ids = new Set(demoRawEvals.map((e) => e.teacherId));
    return storeTeachers
      .filter((t) => ids.has(t.id))
      .map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }));
  }, [demoRawEvals, storeTeachers]);

  // ── Supabase state ───────────────────────────────────────
  const [sbStudent, setSbStudent] = useState<Student | null>(null);
  const [sbClasse, setSbClasse] = useState<Classe | null>(null);
  const [sbLevel, setSbLevel] = useState<Level | null>(null);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [sbAlerts, setSbAlerts] = useState<Alert[]>([]);
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbMyEvals, setSbMyEvals] = useState<RawEval[]>([]);
  const [sbAllEvals, setSbAllEvals] = useState<RawEval[]>([]);
  const [sbRecoveries, setSbRecoveries] = useState<SkillRecoveryAction[]>([]);
  const [sbAttendanceHistory, setSbAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [sbClassTeachers, setSbClassTeachers] = useState<ClassTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sbMyStats = useMemo(
    () => studentId ? computeStats(sbMyEvals, user?.role === "professeur" ? [] : sbRecoveries, sbCompetencies, studentId) : [],
    [sbMyEvals, sbRecoveries, sbCompetencies, studentId, user?.role]
  );
  const sbGlobalStats = useMemo(
    () => studentId ? computeStats(sbAllEvals, sbRecoveries, sbCompetencies, studentId) : [],
    [sbAllEvals, sbRecoveries, sbCompetencies, studentId]
  );
  const sbTimeline = useMemo(
    () => buildTimeline(sbAllEvals.filter((e) => e.studentId === studentId)),
    [sbAllEvals, studentId]
  );

  const mapEval = (e: {
    student_id: string; competency_id: string; teacher_id: string;
    date: string; created_at: string; id: string;
    profiles: { full_name?: string } | null;
  }): RawEval => ({
    id: e.id,
    studentId: e.student_id,
    competencyId: e.competency_id,
    teacherId: e.teacher_id,
    teacherName: e.profiles?.full_name ?? "",
    date: e.date,
    createdAt: e.created_at,
  });

  const mapRecovery = (row: {
    id: string; student_id: string; competency_id: string; class_id: string; action_type: "increase" | "reset_to_100";
    previous_score: number; new_score: number; meeting_date: string; student_reason: string; meeting_notes: string;
    created_by: string; created_at: string; profiles: { full_name?: string } | null;
  }): SkillRecoveryAction => ({
    id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
    actionType: row.action_type, previousScore: row.previous_score, newScore: row.new_score,
    meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
    createdBy: row.created_by, createdByName: row.profiles?.full_name, createdAt: row.created_at,
  });

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: stuData, error: stuErr } = await supabase
        .from("students").select("*").eq("id", studentId).single();
      if (stuErr) throw stuErr;

      const student: Student = {
        id: stuData.id, firstName: stuData.first_name, lastName: stuData.last_name,
        birthDate: stuData.birth_date ?? "", gender: (stuData.gender ?? "M") as "M" | "F",
        classId: stuData.class_id ?? "", photoUrl: stuData.photo_url ?? undefined,
        createdAt: stuData.created_at,
      };
      setSbStudent(student);

      const [classesRes, compRes, alertsRes, attRes, tcaRes] = await Promise.all([
        supabase.from("classes").select("*, levels(*)").eq("is_archived", false).order("name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("alerts").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
        supabase.from("attendance").select("*").eq("student_id", studentId).order("date", { ascending: false }),
        student.classId
          ? supabase.from("teacher_class_assignments").select("teacher_id, profiles(full_name)").eq("class_id", student.classId)
          : Promise.resolve({ data: [] as { teacher_id: string; profiles: { full_name?: string } | null }[], error: null }),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (compRes.error) throw compRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "", teacherId: c.teacher_id ?? undefined,
        capacity: c.capacity, studentCount: c.student_count,
        isArchived: c.is_archived, schoolYearId: c.school_year_id, createdAt: c.created_at,
      }));
      setSbClasses(classes);

      const studentClass = classes.find((c) => c.id === student.classId) ?? null;
      setSbClasse(studentClass);

      const classRow = (classesRes.data ?? []).find((c) => c.id === student.classId);
      const lvl = classRow?.levels as { id: string; name: string; code: string; is_archived: boolean; created_at: string } | null;
      setSbLevel(lvl ? { id: lvl.id, name: lvl.name, code: lvl.code, isArchived: lvl.is_archived, createdAt: lvl.created_at } : null);

      const competencies: Competency[] = (compRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, isArchived: c.is_archived ?? false, createdAt: c.created_at,
      }));
      setSbCompetencies(competencies);

      const alerts: Alert[] = (alertsRes.data ?? []).map((a) => ({
        id: a.id, studentId: a.student_id, level: a.level,
        cause: a.cause, date: a.date, resolved: a.resolved,
        resolvedAt: a.resolved_at ?? undefined, createdAt: a.created_at,
      }));
      setSbAlerts(alerts);

      setSbAttendanceHistory((attRes.data ?? []).map((a) => ({
        id: a.id, studentId: a.student_id, classId: a.class_id,
        teacherId: a.teacher_id ?? "", date: a.date,
        period: (a.period ?? "morning") as AttendancePeriod,
        status: a.status as AttendanceStatus,
        isConfirmedByAdmin: a.is_confirmed_by_admin ?? false,
        createdAt: a.created_at,
      })));

      setSbClassTeachers((tcaRes.data ?? []).map((r) => ({
        id: r.teacher_id,
        name: (r.profiles as { full_name?: string } | null)?.full_name ?? r.teacher_id,
      })));

      // Fetch penalty records (no status column)
      const evalsBase = supabase
        .from("evaluations")
        .select("id, student_id, competency_id, teacher_id, date, created_at, profiles(full_name)")
        .eq("student_id", studentId);

      if (user?.role === "professeur" && user?.id) {
        const [myRes, allRes] = await Promise.all([
          evalsBase.eq("teacher_id", user.id),
          supabase
            .from("evaluations")
            .select("id, student_id, competency_id, teacher_id, date, created_at, profiles(full_name)")
            .eq("student_id", studentId),
        ]);
        setSbMyEvals((myRes.data ?? []).map(mapEval));
        setSbAllEvals((allRes.data ?? []).map(mapEval));
      } else {
        const { data: allEvData } = await evalsBase;
        const allEvals = (allEvData ?? []).map(mapEval);
        setSbAllEvals(allEvals);
        setSbMyEvals(allEvals);
      }

      const { data: recoveryData, error: recoveryError } = await supabase
        .from("skill_recovery_actions")
        .select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at, profiles(full_name)")
        .eq("student_id", studentId)
        .order("meeting_date");
      if (recoveryError) throw recoveryError;
      setSbRecoveries((recoveryData ?? []).map((row) => mapRecovery(row as Parameters<typeof mapRecovery>[0])));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [studentId, user?.id, user?.role]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

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

  const createRecoveryAction = useCallback(async (submission: RecoverySubmission) => {
    const currentStudent = isDemo ? demoStudent : sbStudent;
    const currentClass = isDemo ? demoClasse : sbClasse;
    if (!currentStudent || !currentClass) throw new Error("Student class is unavailable.");
    const isAllowed = user?.role === "admin" || user?.role === "directeur" || (user?.role === "professeur" && currentClass.teacherId === user.id);
    if (!isAllowed) throw new Error("You are not authorised to recover this skill.");
    const allPenalties = isDemo ? demoRawEvals : sbAllEvals;
    const allRecoveries = isDemo ? demoRecoveries : sbRecoveries;
    const currentScore = competencyScoreFromLedger(allPenalties, allRecoveries, currentStudent.id, submission.competencyId);
    if (submission.newScore <= currentScore) throw new Error("The new score must be strictly greater than the current score.");
    if (submission.actionType === "reset_to_100" && submission.newScore !== 100) throw new Error("A reset must set the score to 100.");
    if (isDemo) {
      addDemoRecovery({
        studentId: currentStudent.id, competencyId: submission.competencyId, classId: currentClass.id,
        actionType: submission.actionType, previousScore: currentScore, newScore: submission.newScore,
        meetingDate: submission.meetingDate, studentReason: submission.studentReason, meetingNotes: submission.meetingNotes,
        createdBy: user?.id ?? currentClass.teacherId ?? "demo-admin", createdByName: user?.fullName,
      });
      return;
    }
    if (!supabase) throw new Error("Supabase is unavailable.");
    const { error: rpcError } = await supabase.rpc("create_skill_recovery_action", {
      p_student_id: currentStudent.id, p_competency_id: submission.competencyId, p_action_type: submission.actionType,
      p_new_score: submission.newScore, p_meeting_date: submission.meetingDate,
      p_student_reason: submission.studentReason, p_meeting_notes: submission.meetingNotes,
    });
    if (rpcError) throw new Error(rpcError.message);
    await fetchFromSupabase();
  }, [isDemo, demoStudent, sbStudent, demoClasse, sbClasse, user, demoRawEvals, sbAllEvals, demoRecoveries, sbRecoveries, addDemoRecovery, fetchFromSupabase]);

  return {
    student: isDemo ? demoStudent : sbStudent,
    classe: isDemo ? demoClasse : sbClasse,
    level: isDemo ? demoLevel : sbLevel,
    competencies: isDemo ? storeCompetencies : sbCompetencies,
    myStats: isDemo ? demoMyStats : sbMyStats,
    globalStats: isDemo ? demoGlobalStats : sbGlobalStats,
    alerts: isDemo ? demoAlerts : sbAlerts,
    timeline: isDemo ? demoTimeline : sbTimeline,
    attendanceHistory: isDemo ? demoAttendanceHistory : sbAttendanceHistory,
    classes: isDemo ? storeClasses : sbClasses,
    rawEvals: isDemo ? demoRawEvals : sbAllEvals,
    recoveryActions: isDemo ? demoRecoveries : sbRecoveries,
    classTeachers: isDemo ? demoClassTeachers : sbClassTeachers,
    loading,
    error,
    updateStudent: isDemo ? updateStudentDemo : updateStudentReal,
    createRecoveryAction,
    refetch: fetchFromSupabase,
  };
}
