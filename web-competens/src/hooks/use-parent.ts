import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { isMissingSkillRecoveryTable } from "@/lib/skill-recovery";
import { scoreToStatus, buildTimeline, competencyScoreFromLedger, type PenaltyLedgerEvent, type TimelinePoint } from "@/lib/eval-utils";
import type { Student, Competency, Alert, EvaluationStatus, ReportedAttendanceStatus, SkillRecoveryAction } from "@/types";
import type { DailyEvalRecord, ClassTeacher } from "@/components/DailyGranularAnalytics";

export type { TimelinePoint, DailyEvalRecord, ClassTeacher };

export interface ParentChildStat {
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
  studentId: string;
  competencyId: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  date: string;
  createdAt: string;
}

function computeStats(penalties: RawEval[], recoveries: SkillRecoveryAction[], competencies: Competency[], studentId: string): ParentChildStat[] {
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

export interface ParentChild extends Student {
  stats: ParentChildStat[];
  alerts: Alert[];
  timeline: TimelinePoint[];
  /** Confirmed morning attendance for today — null = not recorded or not confirmed yet */
  todayMorning: ReportedAttendanceStatus | null;
  /** Confirmed afternoon attendance for today — null = not recorded or not confirmed yet */
  todayAfternoon: ReportedAttendanceStatus | null;
  /** Optional reason provided by management when the child is in administration. */
  todayMorningAdministrationReason?: string;
  todayAfternoonAdministrationReason?: string;
  absenceHistory: string[];
  rawEvals: DailyEvalRecord[];
  recoveryActions: SkillRecoveryAction[];
  classTeachers: ClassTeacher[];
}

export interface UseParentReturn {
  children: ParentChild[];
  competencies: Competency[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useParent(): UseParentReturn {
  const { user } = useAuth();

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!supabase || !user || user.role !== "parent") return;
    setLoading(true);
    setError(null);
    try {
      const { data: links, error: linksErr } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", user.id);
      if (linksErr) throw linksErr;

      const studentIds = (links ?? []).map((l) => l.student_id);
      if (studentIds.length === 0) {
        setChildren([]);
        setCompetencies([]);
        setLoading(false);
        return;
      }

      const todayDate = new Date().toISOString().split("T")[0];

      const [studentsRes, compRes, evalsRes, recoveryRes, alertsRes, attRes] = await Promise.all([
        supabase.from("students").select("*").in("id", studentIds),
        supabase.from("competencies").select("*").order("order"),
        // Penalty rows only — no status column
        supabase
          .from("evaluations")
          .select("student_id, competency_id, teacher_id, class_id, date, created_at, profiles(full_name)")
          .in("student_id", studentIds),
        supabase
          .from("skill_recovery_actions")
          .select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at, profiles(full_name)")
          .in("student_id", studentIds),
        supabase
          .from("alerts")
          .select("*")
          .in("student_id", studentIds)
          .eq("resolved", false),
        // Only confirmed records are visible to parents
        supabase
          .from("attendance")
          .select("student_id, class_id, date, period, status, admin_presence_status, admin_presence_reason")
          .in("student_id", studentIds)
          .eq("is_confirmed_by_admin", true)
          .order("date", { ascending: false }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (compRes.error) throw compRes.error;
      if (evalsRes.error) throw evalsRes.error;
      if (recoveryRes.error && !isMissingSkillRecoveryTable(recoveryRes.error)) throw recoveryRes.error;

      const students: Student[] = (studentsRes.data ?? []).map((s) => ({
        id: s.id, firstName: s.first_name, lastName: s.last_name,
        birthDate: s.birth_date ?? "", gender: (s.gender ?? "M") as "M" | "F",
        classId: s.class_id ?? "", photoUrl: s.photo_url ?? undefined,
        createdAt: s.created_at,
      }));

      const comps: Competency[] = (compRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, isArchived: c.is_archived ?? false, createdAt: c.created_at,
      }));

      const evals: RawEval[] = (evalsRes.data ?? []).map((e) => ({
        studentId: (e as { student_id: string }).student_id,
        competencyId: (e as { competency_id: string }).competency_id,
        teacherId: (e as { teacher_id?: string }).teacher_id ?? "",
        teacherName: (e.profiles as { full_name?: string } | null)?.full_name ?? "",
        classId: (e as { class_id?: string }).class_id ?? "",
        date: (e as { date: string }).date,
        createdAt: (e as { created_at: string }).created_at,
      }));

      const recoveries: SkillRecoveryAction[] = recoveryRes.error ? [] : (recoveryRes.data ?? []).map((row) => ({
        id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
        actionType: row.action_type as "increase" | "reset_to_100", previousScore: row.previous_score, newScore: row.new_score,
        meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
        createdBy: row.created_by, createdByName: (row.profiles as { full_name?: string } | null)?.full_name,
        createdAt: row.created_at,
      }));

      const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
      const tcasByClass = new Map<string, ClassTeacher[]>();
      if (classIds.length > 0) {
        const { data: tcaData } = await supabase
          .from("teacher_class_assignments")
          .select("class_id, teacher_id, profiles(full_name)")
          .in("class_id", classIds);
        for (const row of (tcaData ?? [])) {
          const classId = (row as { class_id: string }).class_id;
          const entry: ClassTeacher = {
            id: (row as { teacher_id: string }).teacher_id,
            name: (row.profiles as { full_name?: string } | null)?.full_name ?? (row as { teacher_id: string }).teacher_id,
          };
          const list = tcasByClass.get(classId) ?? [];
          list.push(entry);
          tcasByClass.set(classId, list);
        }
      }

      // Build per-student maps for today morning/afternoon + absence history
      const morningMap = new Map<string, { status: ReportedAttendanceStatus; administrationReason?: string }>();
      const afternoonMap = new Map<string, { status: ReportedAttendanceStatus; administrationReason?: string }>();
      const absenceMap = new Map<string, string[]>();
      const currentClassByStudent = new Map(students.map((student) => [student.id, student.classId]));

      for (const a of (attRes.data ?? [])) {
        const sid = a.student_id as string;
        if ((a.class_id as string) !== currentClassByStudent.get(sid)) continue;
        const period = a.period as string;
        const teacherStatus = a.status as "present" | "absent";
        const isInAdministration = a.admin_presence_status === "in_administration";
        const reportedStatus: ReportedAttendanceStatus = isInAdministration ? "in_administration" : teacherStatus;
        const administrationReason = isInAdministration ? a.admin_presence_reason ?? undefined : undefined;
        const date = a.date as string;

        if (date === todayDate) {
          if (period === "morning") morningMap.set(sid, { status: reportedStatus, administrationReason });
          else if (period === "afternoon") afternoonMap.set(sid, { status: reportedStatus, administrationReason });
        }
        if (reportedStatus === "absent") {
          const list = absenceMap.get(sid) ?? [];
          if (!list.includes(date)) list.push(date);
          absenceMap.set(sid, list);
        }
      }

      const alertsMap = new Map<string, Alert[]>();
      for (const a of (alertsRes.data ?? [])) {
        const alert: Alert = {
          id: a.id, studentId: a.student_id, level: a.level,
          cause: a.cause, date: a.date, resolved: a.resolved,
          resolvedAt: a.resolved_at ?? undefined, createdAt: a.created_at,
        };
        const list = alertsMap.get(a.student_id) ?? [];
        list.push(alert);
        alertsMap.set(a.student_id, list);
      }

      const enriched: ParentChild[] = students.map((s) => {
        const currentEvals = evals.filter((e) => e.studentId === s.id && e.classId === s.classId);
        const currentRecoveries = recoveries.filter(
          (action) => action.studentId === s.id && action.classId === s.classId,
        );
        return {
          ...s,
          stats: computeStats(currentEvals, currentRecoveries, comps, s.id),
          alerts: alertsMap.get(s.id) ?? [],
          timeline: buildTimeline(currentEvals),
          todayMorning: morningMap.get(s.id)?.status ?? null,
          todayAfternoon: afternoonMap.get(s.id)?.status ?? null,
          todayMorningAdministrationReason: morningMap.get(s.id)?.administrationReason,
          todayAfternoonAdministrationReason: afternoonMap.get(s.id)?.administrationReason,
          absenceHistory: absenceMap.get(s.id) ?? [],
          rawEvals: currentEvals,
          recoveryActions: currentRecoveries,
          classTeachers: tcasByClass.get(s.classId) ?? [],
        };
      });

      setCompetencies(comps);
      setChildren(enriched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { children, competencies, loading, error, refetch: fetchData };
}
