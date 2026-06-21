import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Student, Competency, Alert, EvaluationStatus } from "@/types";

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
  status: EvaluationStatus;
  date: string;
}

function computeStats(evals: RawEval[], competencies: Competency[], studentId: string): ParentChildStat[] {
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

export interface ParentChild extends Student {
  stats: ParentChildStat[];
  alerts: Alert[];
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
  const [allEvals, setAllEvals] = useState<RawEval[]>([]);
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

      // 2. Fetch students, competencies, evaluations, alerts in parallel
      const [studentsRes, compRes, evalsRes, alertsRes] = await Promise.all([
        supabase.from("students").select("*").in("id", studentIds),
        supabase.from("competencies").select("*").order("order"),
        supabase
          .from("evaluations")
          .select("student_id, competency_id, status, date")
          .in("student_id", studentIds),
        supabase
          .from("alerts")
          .select("*")
          .in("student_id", studentIds)
          .eq("resolved", false),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (compRes.error) throw compRes.error;

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

      const comps: Competency[] = (compRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title,
        description: c.description ?? "", pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order, createdAt: c.created_at,
      }));

      const evals: RawEval[] = (evalsRes.data ?? []).map((e) => ({
        studentId: e.student_id,
        competencyId: e.competency_id,
        status: e.status as EvaluationStatus,
        date: e.date,
      }));

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
      }));

      setAllEvals(evals);
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
