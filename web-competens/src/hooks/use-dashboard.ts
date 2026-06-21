import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Alert, Student, SchoolYear } from "@/types";

export interface DashboardData {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  totalEvaluations: number;
  activeYear: SchoolYear | undefined;
  weeklyData: { day: string; count: number }[];
  alerts: (Alert & { student?: Student })[];
  loading: boolean;
  error: string | null;
}

export function useDashboard(): DashboardData {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Store selectors (always called)
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeTeachers = useAppStore((s) => s.teachers);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeAlerts = useAppStore((s) => s.alerts);
  const storeSchoolYears = useAppStore((s) => s.schoolYears);

  const storeActiveYear = useMemo(() => storeSchoolYears.find((y) => y.isActive), [storeSchoolYears]);
  const storeActiveAlerts = useMemo(
    () =>
      storeAlerts
        .filter((a) => !a.resolved)
        .map((a) => ({ ...a, student: storeStudents.find((s) => s.id === a.studentId) })),
    [storeAlerts, storeStudents]
  );

  const storeWeeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        day: d.toLocaleDateString("fr-FR", { weekday: "short" }),
        count: storeEvaluations.filter((e) => e.date === dateStr).length,
      });
    }
    return days;
  }, [storeEvaluations]);

  // Supabase state
  const [sbData, setSbData] = useState({
    totalStudents: 0,
    totalClasses: 0,
    totalTeachers: 0,
    totalEvaluations: 0,
    activeYear: undefined as SchoolYear | undefined,
    weeklyData: [] as { day: string; count: number }[],
    alerts: [] as (Alert & { student?: Student })[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      // Build date range for weekly data (last 7 days)
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      const startDate = days[0];
      const today = days[6];

      const [
        studentsRes,
        classesRes,
        teachersRes,
        evaluationsCountRes,
        yearRes,
        weeklyEvalsRes,
        alertsRes,
      ] = await Promise.all([
        supabase.from("students").select("*", { count: "exact", head: true }),
        supabase.from("classes").select("*", { count: "exact", head: true }).eq("is_archived", false),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "professeur").eq("status", "active"),
        supabase.from("evaluations").select("*", { count: "exact", head: true }),
        supabase.from("school_years").select("*").eq("is_active", true).limit(1),
        supabase.from("evaluations").select("date").gte("date", startDate).lte("date", today),
        supabase.from("alerts").select("*, students(id, first_name, last_name, class_id)").eq("resolved", false).order("created_at", { ascending: false }).limit(5),
      ]);

      // Weekly data aggregation
      const evalsByDay: Record<string, number> = {};
      for (const e of weeklyEvalsRes.data ?? []) {
        evalsByDay[e.date] = (evalsByDay[e.date] ?? 0) + 1;
      }
      const weeklyData = days.map((d) => ({
        day: new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short" }),
        count: evalsByDay[d] ?? 0,
      }));

      // Active year
      const yr = yearRes.data?.[0];
      const activeYear: SchoolYear | undefined = yr
        ? {
            id: yr.id, name: yr.name, startDate: yr.start_date,
            endDate: yr.end_date, isActive: yr.is_active,
            isClosed: yr.is_closed, createdAt: yr.created_at, updatedAt: yr.updated_at,
          }
        : undefined;

      // Alerts with student names
      const alerts: (Alert & { student?: Student })[] = (alertsRes.data ?? []).map((a) => {
        const s = a.students as { id: string; first_name: string; last_name: string; class_id: string } | null;
        return {
          id: a.id,
          studentId: a.student_id,
          level: a.level as "warning" | "critical",
          cause: a.cause,
          date: a.date,
          resolved: a.resolved,
          resolvedAt: a.resolved_at ?? undefined,
          createdAt: a.created_at,
          student: s
            ? {
                id: s.id,
                firstName: s.first_name,
                lastName: s.last_name,
                birthDate: "",
                gender: "M" as const,
                classId: s.class_id ?? "",
                createdAt: "",
              }
            : undefined,
        };
      });

      setSbData({
        totalStudents: studentsRes.count ?? 0,
        totalClasses: classesRes.count ?? 0,
        totalTeachers: teachersRes.count ?? 0,
        totalEvaluations: evaluationsCountRes.count ?? 0,
        activeYear,
        weeklyData,
        alerts,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement du dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  if (isDemo) {
    return {
      totalStudents: storeStudents.length,
      totalClasses: storeClasses.length,
      totalTeachers: storeTeachers.length,
      totalEvaluations: storeEvaluations.length,
      activeYear: storeActiveYear,
      weeklyData: storeWeeklyData,
      alerts: storeActiveAlerts,
      loading: false,
      error: null,
    };
  }

  return { ...sbData, loading, error };
}
