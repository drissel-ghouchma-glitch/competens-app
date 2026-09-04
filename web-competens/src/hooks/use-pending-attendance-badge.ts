import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";

/** Number of complete registers that still need an administrative confirmation. */
export function usePendingAttendanceBadge() {
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const storeAttendance = useAppStore((state) => state.attendance);
  const storeClasses = useAppStore((state) => state.classes);
  const storeYears = useAppStore((state) => state.schoolYears);
  const [count, setCount] = useState(0);
  const canReview = user?.role === "admin" || user?.role === "directeur";

  const demoCount = useMemo(() => {
    if (!canReview) return 0;
    const activeYearId = storeYears.find((year) => year.isActive && !year.isClosed)?.id;
    const activeClassIds = new Set(storeClasses
      .filter((classe) => !classe.isArchived && classe.schoolYearId === activeYearId)
      .map((classe) => classe.id));
    return new Set(storeAttendance
      .filter((record) => !record.isConfirmedByAdmin && activeClassIds.has(record.classId))
      .map((record) => `${record.classId}:${record.date}:${record.period}`)).size;
  }, [canReview, storeAttendance, storeClasses, storeYears]);

  const refresh = useCallback(async () => {
    if (!supabase || !canReview) {
      setCount(0);
      return;
    }
    const { data: activeClasses, error: classesError } = await supabase
      .from("classes")
      .select("id, school_years!inner(is_active,is_closed)")
      .eq("is_archived", false)
      .eq("school_years.is_active", true)
      .eq("school_years.is_closed", false);
    if (classesError) return;
    const classIds = (activeClasses ?? []).map((classe) => classe.id);
    if (classIds.length === 0) {
      setCount(0);
      return;
    }
    const { data: pending, error: attendanceError } = await supabase
      .from("attendance")
      .select("class_id, date, period")
      .in("class_id", classIds)
      .eq("is_confirmed_by_admin", false);
    if (attendanceError) return;
    setCount(new Set((pending ?? []).map((record) => `${record.class_id}:${record.date}:${record.period}`)).size);
  }, [canReview]);

  useEffect(() => {
    if (!isDemo) void refresh();
  }, [isDemo, refresh]);

  useEffect(() => {
    if (isDemo || !supabase || !canReview) return;
    const channel = supabase
      .channel("pending-attendance-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canReview, isDemo, refresh]);

  return isDemo ? demoCount : count;
}
