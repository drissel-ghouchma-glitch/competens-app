import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { statusToScore, scoreToStatus, buildTimeline, type TimelinePoint } from "@/lib/eval-utils";
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
}

interface RawEval {
  studentId: string;
  competencyId: string;
  teacherId: string;
  teacherName: string;
  status: EvaluationStatus;
  date: string;
}

function computeStats(evals: RawEval[], competencies: Competency[], studentId: string): ParentChildStat[] {
  const studentEvals = evals.filter((e) => e.studentId === studentId);
  return competencies.map((comp) => {
    const ce = studentEvals.filter((e) => e.competencyId === comp.id);
    if (ce.length === 0) {
      return { competencyId: comp.id, competencyCode: comp.code, competencyTitle: comp.title, acquisitionRate: 100, totalEvaluations: 0, lastStatus: "acquis" as EvaluationStatus };
    }
    const avg = ce.reduce((sum, e) => sum + statusToScore(e.status), 0) / ce.length;
    const rate = Math.round(avg);
    return {
      competencyId: comp.id,
      competencyCode: comp.code,
      competencyTitle: comp.title,
      acquisitionRate: rate,
      totalEvaluations: ce.length,
      lastStatus: scoreToStatus(rate),
    };
  });
}

export interface ParentChild extends Student {
  stats: ParentChildStat[];
  alerts: Alert[];
  timeline: TimelinePoint[];
  /** Attendance status for today — null if not recorded yet */
  todayAttendance: AttendanceStatus | null;
  /** Dates when the child was absent, most recent first */
  absenceHistory: string[];
  /** Un-aggregated eval records for daily granular analytics */
  rawEvals: DailyEvalRecord[];
  /** Teachers assigned to this child's class */
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
      // 1. Get linked student IDs
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

      // 2. Fetch everything in parallel — evaluations include teacher names, plus attendance
      const [studentsRes, compRes, evalsRes, alertsRes, attRes] = await Promise.all([
        supabase.from("students").select("*").in("id", studentIds),
        supabase.from("competencies").select("*").order("order"),
        supabase
          .from("evaluations")
          .select("student_id, competency_id, teacher_id, status, date, profiles(full_name)")
          .in("student_id", studentIds),
        supabase
          .from("alerts")
          .select("*")
          .in("student_id", studentIds)
          .eq("resolved", false),
        supabase
          .from("attendance")
          .select("student_id, date, status")
          .in("student_id", studentIds)
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
        order: c.order, createdAt: c.created_at,
      }));

      const evals: RawEval[] = (evalsRes.data ?? []).map((e) => ({
        studentId: e.student_id,
        competencyId: e.competency_id,
        teacherId: (e as { teacher_id?: string }).teacher_id ?? "",
        teacherName: (e.profiles as { full_name?: string } | null)?.full_name ?? "",
        status: e.status as EvaluationStatus,
        date: e.date,
      }));

      // Fetch teachers for each unique class
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

      // Build attendance maps
      const todayAttMap = new Map<string, AttendanceStatus>();
      const absenceMap  = new Map<string, string[]>();
      for (const a of (attRes.data ?? [])) {
        if (a.date === todayDate) todayAttMap.set(a.student_id, a.status as AttendanceStatus);
        if (a.status === "absent") {
          const list = absenceMap.get(a.student_id) ?? [];
          list.push(a.date);
          absenceMap.set(a.student_id, list);
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
        todayAttendance: todayAttMap.get(s.id) ?? null,
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
