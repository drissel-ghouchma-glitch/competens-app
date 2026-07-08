import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { scoreToStatus, buildTimeline, type TimelinePoint } from "@/lib/eval-utils";
import type { Student, Competency, Alert, EvaluationStatus, AttendanceStatus } from "@/types";
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
interface RawEval {
  studentId: string;
  competencyId: string;
  teacherId: string;
  teacherName: string;
  date: string;
}

function computeStats(penalties: RawEval[], competencies: Competency[], studentId: string): ParentChildStat[] {
  const studentPenalties = penalties.filter((p) => p.studentId === studentId);
  return competencies.map((comp) => {
    const cp = studentPenalties.filter((p) => p.competencyId === comp.id);
    const rate = Math.max(0, 100 - cp.length);
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
  todayMorning: AttendanceStatus | null;
  /** Confirmed afternoon attendance for today — null = not recorded or not confirmed yet */
  todayAfternoon: AttendanceStatus | null;
  absenceHistory: string[];
  rawEvals: DailyEvalRecord[];
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

      const [studentsRes, compRes, evalsRes, alertsRes, attRes] = await Promise.all([
        supabase.from("students").select("*").in("id", studentIds),
        supabase.from("competencies").select("*").order("order"),
        // Penalty rows only — no status column
        supabase
          .from("evaluations")
          .select("student_id, competency_id, teacher_id, date, profiles(full_name)")
          .in("student_id", studentIds),
        supabase
          .from("alerts")
          .select("*")
          .in("student_id", studentIds)
          .eq("resolved", false),
        // Only confirmed records are visible to parents
        supabase
          .from("attendance")
          .select("student_id, date, period, status")
          .in("student_id", studentIds)
          .eq("is_confirmed_by_admin", true)
          .order("date", { ascending: false }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (compRes.error) throw compRes.error;

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
        date: (e as { date: string }).date,
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
      const morningMap = new Map<string, AttendanceStatus>();
      const afternoonMap = new Map<string, AttendanceStatus>();
      const absenceMap = new Map<string, string[]>();

      for (const a of (attRes.data ?? [])) {
        const sid = a.student_id as string;
        const period = a.period as string;
        const status = a.status as AttendanceStatus;
        const date = a.date as string;

        if (date === todayDate) {
          if (period === "morning") morningMap.set(sid, status);
          else if (period === "afternoon") afternoonMap.set(sid, status);
        }
        if (status === "absent") {
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

      const enriched: ParentChild[] = students.map((s) => ({
        ...s,
        stats: computeStats(evals, comps, s.id),
        alerts: alertsMap.get(s.id) ?? [],
        timeline: buildTimeline(evals.filter((e) => e.studentId === s.id)),
        todayMorning: morningMap.get(s.id) ?? null,
        todayAfternoon: afternoonMap.get(s.id) ?? null,
        absenceHistory: absenceMap.get(s.id) ?? [],
        rawEvals: evals.filter((e) => e.studentId === s.id),
        classTeachers: tcasByClass.get(s.classId) ?? [],
      }));

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
