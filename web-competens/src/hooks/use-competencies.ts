import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Competency } from "@/types";

type AddCompetencyInput = Omit<Competency, "id" | "createdAt">;

export interface UseCompetenciesReturn {
  competencies: Competency[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addCompetency: (data: AddCompetencyInput) => Promise<void>;
  updateCompetency: (id: string, data: Partial<Omit<Competency, "id" | "createdAt">>) => Promise<void>;
}

export function useCompetencies(): UseCompetenciesReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Always call store hooks (React rules of hooks)
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeAdd = useAppStore((s) => s.addCompetency);
  const storeUpdate = useAppStore((s) => s.updateCompetency);

  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("competencies")
        .select("*")
        .order("order");

      if (err) throw err;

      const competencies: Competency[] = (data ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        description: c.description ?? "",
        pedagogicalAdvice: c.pedagogical_advice ?? "",
        order: c.order,
        createdAt: c.created_at,
      }));

      setSbCompetencies(competencies);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des compétences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real (Supabase) CRUD ─────────────────────────────────

  const addCompetencyReal = useCallback(
    async (data: AddCompetencyInput) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const { error: err } = await supabase.from("competencies").insert({
        code: data.code,
        title: data.title,
        description: data.description,
        pedagogical_advice: data.pedagogicalAdvice,
        order: data.order,
      });
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const updateCompetencyReal = useCallback(
    async (id: string, data: Partial<Omit<Competency, "id" | "createdAt">>) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const update: Record<string, unknown> = {};
      if (data.code !== undefined) update.code = data.code;
      if (data.title !== undefined) update.title = data.title;
      if (data.description !== undefined) update.description = data.description;
      if (data.pedagogicalAdvice !== undefined) update.pedagogical_advice = data.pedagogicalAdvice;
      if (data.order !== undefined) update.order = data.order;

      const { error: err } = await supabase.from("competencies").update(update).eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  // ── Demo CRUD wrappers ────────────────────────────────────

  const addCompetencyDemo = useCallback(
    async (data: AddCompetencyInput) => { storeAdd(data); },
    [storeAdd]
  );

  const updateCompetencyDemo = useCallback(
    async (id: string, data: Partial<Omit<Competency, "id" | "createdAt">>) => {
      storeUpdate(id, data);
    },
    [storeUpdate]
  );

  return {
    competencies: isDemo ? storeCompetencies : sbCompetencies,
    loading,
    error,
    refetch: fetchFromSupabase,
    addCompetency: isDemo ? addCompetencyDemo : addCompetencyReal,
    updateCompetency: isDemo ? updateCompetencyDemo : updateCompetencyReal,
  };
}
