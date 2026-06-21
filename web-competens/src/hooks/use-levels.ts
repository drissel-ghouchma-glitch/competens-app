import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Level } from "@/types";

function rowToLevel(r: Record<string, unknown>): Level {
  return {
    id: r.id as string,
    name: r.name as string,
    code: r.code as string,
    isArchived: r.is_archived as boolean,
    createdAt: r.created_at as string,
  };
}

export interface UseLevelsReturn {
  levels: Level[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addLevel: (data: Omit<Level, "id" | "createdAt">) => Promise<void>;
  updateLevel: (id: string, data: Partial<Level>) => Promise<void>;
  archiveLevel: (id: string) => Promise<void>;
}

export function useLevels(): UseLevelsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  const storeLevels = useAppStore((s) => s.levels);
  const storeAdd = useAppStore((s) => s.addLevel);
  const storeUpdate = useAppStore((s) => s.updateLevel);
  const storeArchive = useAppStore((s) => s.archiveLevel);

  const [sbLevels, setSbLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("levels")
        .select("*")
        .order("name");
      if (err) throw err;
      setSbLevels((data ?? []).map(rowToLevel));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des niveaux");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real CRUD ──────────────────────────────────────────────

  const addReal = useCallback(
    async (data: Omit<Level, "id" | "createdAt">) => {
      if (!supabase) throw new Error("Supabase non disponible");
      const { error: err } = await supabase.from("levels").insert({
        name: data.name,
        code: data.code,
        is_archived: data.isArchived,
      });
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const updateReal = useCallback(
    async (id: string, data: Partial<Level>) => {
      if (!supabase) return;
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.code !== undefined) update.code = data.code;
      if (data.isArchived !== undefined) update.is_archived = data.isArchived;
      const { error: err } = await supabase.from("levels").update(update).eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const archiveReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const level = sbLevels.find((l) => l.id === id);
      const { error: err } = await supabase
        .from("levels")
        .update({ is_archived: !level?.isArchived })
        .eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [sbLevels, fetchFromSupabase]
  );

  // ── Demo wrappers ──────────────────────────────────────────

  const addDemo = useCallback(
    async (data: Omit<Level, "id" | "createdAt">) => { storeAdd(data); },
    [storeAdd]
  );
  const updateDemo = useCallback(
    async (id: string, data: Partial<Level>) => { storeUpdate(id, data); },
    [storeUpdate]
  );
  const archiveDemo = useCallback(
    async (id: string) => { storeArchive(id); },
    [storeArchive]
  );

  return {
    levels: isDemo ? storeLevels : sbLevels,
    loading,
    error,
    refetch: fetchFromSupabase,
    addLevel: isDemo ? addDemo : addReal,
    updateLevel: isDemo ? updateDemo : updateReal,
    archiveLevel: isDemo ? archiveDemo : archiveReal,
  };
}
