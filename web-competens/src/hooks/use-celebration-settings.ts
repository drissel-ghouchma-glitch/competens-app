import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";

export interface UseCelebrationSettingsReturn {
  isPublished: boolean;
  loading: boolean;
  error: string | null;
  setPublished: (value: boolean) => Promise<void>;
}

export function useCelebrationSettings(): UseCelebrationSettingsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const storePublished = useAppStore((s) => s.celebrationPublished);
  const storeSetPublished = useAppStore((s) => s.setCelebrationPublished);

  const [sbPublished, setSbPublished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("system_settings")
        .select("is_celebration_published")
        .eq("id", 1)
        .maybeSingle();
      if (err) throw err;
      setSbPublished(data?.is_celebration_published ?? false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  const setPublishedReal = useCallback(async (value: boolean) => {
    if (!supabase) throw new Error("Supabase non disponible");
    const { error: err } = await supabase
      .from("system_settings")
      .update({ is_celebration_published: value })
      .eq("id", 1);
    if (err) throw new Error(err.message);
    setSbPublished(value);
  }, []);

  const setPublishedDemo = useCallback(
    async (value: boolean) => { storeSetPublished(value); },
    [storeSetPublished]
  );

  if (isDemo) {
    return {
      isPublished: storePublished,
      loading: false,
      error: null,
      setPublished: setPublishedDemo,
    };
  }

  return {
    isPublished: sbPublished,
    loading,
    error,
    setPublished: setPublishedReal,
  };
}
