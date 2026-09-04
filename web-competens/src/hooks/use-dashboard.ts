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

interface DashboardSummaryRow {
  active_year_id: string | null;
  active_year_name: string | null;
  active_year_start_date: string | null;
  active_year_end_date: string | null;
  total_students: number | string;
  total_classes: number | string;
  total_teachers: number | string;
  total_evaluations: number | string;
  weekly_activity: unknown;
  recent_alerts: unknown;
}

function jsonRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
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
  const storeActiveClassIds = useMemo(
    () => new Set(storeClasses.filter((classe) => classe.schoolYearId === storeActiveYear?.id && !classe.isArchived).map((classe) => classe.id)),
    [storeClasses, storeActiveYear?.id],
  );
  const storeActiveStudents = useMemo(
    () => storeStudents.filter((student) => storeActiveClassIds.has(student.classId)),
    [storeStudents, storeActiveClassIds],
  );
  const storeActiveEvaluations = useMemo(
    () => storeEvaluations.filter((evaluation) => storeActiveClassIds.has(evaluation.classId)),
    [storeEvaluations, storeActiveClassIds],
  );
  const storeActiveAlerts = useMemo(
    () =>
      storeAlerts
        .filter((a) => !a.resolved && storeActiveStudents.some((student) => student.id === a.studentId))
        .map((a) => ({ ...a, student: storeActiveStudents.find((s) => s.id === a.studentId) })),
    [storeAlerts, storeActiveStudents]
  );

  const storeWeeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        day: d.toLocaleDateString("fr-FR", { weekday: "short" }),
        count: storeActiveEvaluations.filter((e) => e.date === dateStr).length,
      });
    }
    return days;
  }, [storeActiveEvaluations]);

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
      const { data, error: summaryError } = await supabase
        .rpc("get_school_dashboard_summary")
        .single<DashboardSummaryRow>();
      if (summaryError) throw summaryError;

      const activeYear: SchoolYear | undefined = data?.active_year_id
        ? {
            id: data.active_year_id,
            name: data.active_year_name ?? "",
            startDate: data.active_year_start_date ?? "",
            endDate: data.active_year_end_date ?? "",
            isActive: true,
            isClosed: false,
            createdAt: "",
            updatedAt: "",
          }
        : undefined;

      const weeklyData = jsonRows(data?.weekly_activity).map((entry) => {
        const date = typeof entry.date === "string" ? entry.date : "";
        return {
          day: date ? new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short" }) : "",
          count: Number(entry.count) || 0,
        };
      });

      // General dashboard alerts intentionally contain no pupil identity.
      const alerts: (Alert & { student?: Student })[] = jsonRows(data?.recent_alerts).map((entry, index) => ({
        id: typeof entry.id === "string" ? entry.id : `dashboard-alert-${index}`,
        studentId: "",
        level: entry.level === "critical" ? "critical" : "warning",
        cause: "",
        date: typeof entry.date === "string" ? entry.date : "",
        resolved: false,
        createdAt: "",
      }));

      setSbData({
        totalStudents: Number(data?.total_students) || 0,
        totalClasses: Number(data?.total_classes) || 0,
        totalTeachers: Number(data?.total_teachers) || 0,
        totalEvaluations: Number(data?.total_evaluations) || 0,
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
      totalStudents: storeActiveStudents.length,
      totalClasses: storeActiveClassIds.size,
      totalTeachers: storeTeachers.length,
      totalEvaluations: storeActiveEvaluations.length,
      activeYear: storeActiveYear,
      weeklyData: storeWeeklyData,
      alerts: storeActiveAlerts,
      loading: false,
      error: null,
    };
  }

  return { ...sbData, loading, error };
}
