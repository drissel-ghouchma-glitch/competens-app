import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Classe, Level, Teacher, SchoolYear } from "@/types";

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export interface UseClassesReturn {
  classes: Classe[];
  levels: Level[];
  teachers: Teacher[];
  activeYear: SchoolYear | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addClass: (data: Omit<Classe, "id" | "createdAt" | "studentCount">) => Promise<void>;
  updateClass: (id: string, data: Partial<Classe>) => Promise<void>;
  archiveClass: (id: string) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
}

export function useClasses(): UseClassesReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Always call store hooks (React rules)
  const storeClasses = useAppStore((s) => s.classes);
  const storeLevels = useAppStore((s) => s.levels);
  const storeTeachers = useAppStore((s) => s.teachers);
  const storeSchoolYears = useAppStore((s) => s.schoolYears);
  const storeAddClass = useAppStore((s) => s.addClass);
  const storeUpdateClass = useAppStore((s) => s.updateClass);
  const storeArchiveClass = useAppStore((s) => s.archiveClass);
  const storeDeleteClass = useAppStore((s) => s.deleteClass);

  const storeActiveYear = useMemo(
    () => storeSchoolYears.find((y) => y.isActive),
    [storeSchoolYears]
  );

  // Supabase state
  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbLevels, setSbLevels] = useState<Level[]>([]);
  const [sbTeachers, setSbTeachers] = useState<Teacher[]>([]);
  const [sbActiveYear, setSbActiveYear] = useState<SchoolYear | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [classesRes, levelsRes, teachersRes, yearsRes] = await Promise.all([
        supabase.from("classes").select("*").order("name"),
        supabase.from("levels").select("*").eq("is_archived", false).order("name"),
        supabase
          .from("profiles")
          .select("id, email, full_name, phone, created_at")
          .eq("role", "professeur")
          .eq("status", "active")
          .order("full_name"),
        supabase.from("school_years").select("*").eq("is_active", true).limit(1),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (levelsRes.error) throw levelsRes.error;
      if (teachersRes.error) throw teachersRes.error;

      const classes: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        levelId: c.level_id ?? "",
        capacity: c.capacity,
        studentCount: c.student_count,
        isArchived: c.is_archived,
        schoolYearId: c.school_year_id,
        createdAt: c.created_at,
      }));

      const levels: Level[] = (levelsRes.data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code,
        isArchived: l.is_archived,
        createdAt: l.created_at,
      }));

      const teachers: Teacher[] = (teachersRes.data ?? []).map((p) => {
        const { firstName, lastName } = splitFullName(p.full_name ?? "");
        return {
          id: p.id,
          userId: p.id,
          firstName,
          lastName,
          email: p.email,
          phone: p.phone ?? undefined,
          createdAt: p.created_at,
        };
      });

      const yearsData = yearsRes.data ?? [];
      const activeYear: SchoolYear | undefined = yearsData[0]
        ? {
            id: yearsData[0].id,
            name: yearsData[0].name,
            startDate: yearsData[0].start_date,
            endDate: yearsData[0].end_date,
            isActive: yearsData[0].is_active,
            isClosed: yearsData[0].is_closed,
            createdAt: yearsData[0].created_at,
            updatedAt: yearsData[0].updated_at,
          }
        : undefined;

      setSbClasses(classes);
      setSbLevels(levels);
      setSbTeachers(teachers);
      setSbActiveYear(activeYear);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des classes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  // ── Real CRUD ────────────────────────────────────────────

  const addClassReal = useCallback(
    async (data: Omit<Classe, "id" | "createdAt" | "studentCount">) => {
      if (!supabase) throw new Error("Supabase non disponible");
      if (!data.schoolYearId) throw new Error("Aucune année scolaire active trouvée");
      const { error: err } = await supabase.from("classes").insert({
        name: data.name,
        level_id: data.levelId || null,
        school_year_id: data.schoolYearId,
        capacity: data.capacity,
        student_count: 0,
        is_archived: false,
      });
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const updateClassReal = useCallback(
    async (id: string, data: Partial<Classe>) => {
      if (!supabase) return;
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.levelId !== undefined) update.level_id = data.levelId || null;
      if (data.capacity !== undefined) update.capacity = data.capacity;
      if (data.isArchived !== undefined) update.is_archived = data.isArchived;
      const { error: err } = await supabase.from("classes").update(update).eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  const archiveClassReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const cls = sbClasses.find((c) => c.id === id);
      const { error: err } = await supabase
        .from("classes")
        .update({ is_archived: !cls?.isArchived })
        .eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [sbClasses, fetchFromSupabase]
  );

  const deleteClassReal = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error: err } = await supabase.from("classes").delete().eq("id", id);
      if (err) throw new Error(err.message);
      await fetchFromSupabase();
    },
    [fetchFromSupabase]
  );

  // ── Demo wrappers (async) ─────────────────────────────────

  const addClassDemo = useCallback(
    async (data: Omit<Classe, "id" | "createdAt" | "studentCount">) => { storeAddClass(data); },
    [storeAddClass]
  );
  const updateClassDemo = useCallback(
    async (id: string, data: Partial<Classe>) => { storeUpdateClass(id, data); },
    [storeUpdateClass]
  );
  const archiveClassDemo = useCallback(
    async (id: string) => { storeArchiveClass(id); },
    [storeArchiveClass]
  );
  const deleteClassDemo = useCallback(
    async (id: string) => { storeDeleteClass(id); },
    [storeDeleteClass]
  );

  return {
    classes: isDemo ? storeClasses : sbClasses,
    levels: isDemo ? storeLevels : sbLevels,
    teachers: isDemo ? storeTeachers : sbTeachers,
    activeYear: isDemo ? storeActiveYear : sbActiveYear,
    loading,
    error,
    refetch: fetchFromSupabase,
    addClass: isDemo ? addClassDemo : addClassReal,
    updateClass: isDemo ? updateClassDemo : updateClassReal,
    archiveClass: isDemo ? archiveClassDemo : archiveClassReal,
    deleteClass: isDemo ? deleteClassDemo : deleteClassReal,
  };
}
