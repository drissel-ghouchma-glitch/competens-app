import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { SchoolYear } from "@/types";

function rowToSchoolYear(r: Record<string, unknown>): SchoolYear {
  return {
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    isActive: r.is_active as boolean,
    isClosed: r.is_closed as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export interface UseSchoolYearsReturn {
  schoolYears: SchoolYear[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addSchoolYear: (data: Omit<SchoolYear, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateSchoolYear: (id: string, data: Partial<SchoolYear>) => Promise<void>;
  toggleSchoolYearActive: (id: string) => Promise<void>;
  closeSchoolYear: (id: string) => Promise<void>;
}

export function useSchoolYears(): UseSchoolYearsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  const storeYears = useAppStore((s) => s.schoolYears);
  const storeAdd = useAppStore((s) => s.addSchoolYear);
  const storeUpdate = useAppStore((s) => s.updateSchoolYear);
  const storeToggle = useAppStore((s) => s.toggleSchoolYearActive);
  const storeClose = useAppStore((s) => s.closeSchoolYear);

  const [sbYears, setSbYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("school_years")
        .select("*")
        .order("created_at", { ascending: false });
      if (err) throw err;
      setSbYears((data ?? []).map(rowToSchoolYear));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des années scolaires");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real CRUD ──────────────────────────────────────────────

  const addReal = useCallback(
    async (data: Omit<SchoolYear, "id" | "createdAt" | "updatedAt">) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const { error: err } = await supabase.from("school_years").insert({
        name: data.name,
        start_date: data.startDate,
        end_date: data.endDate,
        is_active: data.isActive,
        is_closed: data.isClosed,
      });
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const updateReal = useCallback(
    async (id: string, data: Partial<SchoolYear>) => {
      if (!supabase) return;
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.startDate !== undefined) update.start_date = data.startDate;
      if (data.endDate !== undefined) update.end_date = data.endDate;
      if (data.isActive !== undefined) update.is_active = data.isActive;
      if (data.isClosed !== undefined) update.is_closed = data.isClosed;
      const { error: err } = await supabase.from("school_years").update(update).eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const toggleActiveReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      // Deactivate all, then activate the selected one
      const { error: e1 } = await supabase
        .from("school_years")
        .update({ is_active: false })
        .neq("id", "00000000-0000-0000-0000-000000000000"); // update all rows
      if (e1) throw new Error(e1.message);
      const current = sbYears.find((y) => y.id === id);
      const { error: e2 } = await supabase
        .from("school_years")
        .update({ is_active: !current?.isActive })
        .eq("id", id);
      if (e2) throw new Error(e2.message);
      await fetchFromSupabase();
    },
    [sbYears, fetchFromSupabase]
  );

  const closeReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error: err } = await supabase
        .from("school_years")
        .update({ is_closed: true, is_active: false })
        .eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  // ── Demo wrappers ──────────────────────────────────────────

  const addDemo = useCallback(
    async (data: Omit<SchoolYear, "id" | "createdAt" | "updatedAt">) => { storeAdd(data); },
    [storeAdd]
  );
  const updateDemo = useCallback(
    async (id: string, data: Partial<SchoolYear>) => { storeUpdate(id, data); },
    [storeUpdate]
  );
  const toggleDemo = useCallback(
    async (id: string) => { storeToggle(id); },
    [storeToggle]
  );
  const closeDemo = useCallback(
    async (id: string) => { storeClose(id); },
    [storeClose]
  );

  return {
    schoolYears: isDemo ? storeYears : sbYears,
    loading,
    error,
    refetch: fetchFromSupabase,
    addSchoolYear: isDemo ? addDemo : addReal,
    updateSchoolYear: isDemo ? updateDemo : updateReal,
    toggleSchoolYearActive: isDemo ? toggleDemo : toggleActiveReal,
    closeSchoolYear: isDemo ? closeDemo : closeReal,
  };
}
