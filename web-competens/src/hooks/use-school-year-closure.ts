import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import type {
  PromotionDecision,
  SchoolYearClosureDecisionInput,
  SchoolYearClosureResult,
} from "@/types";

const NEXT_LEVEL: Record<string, string> = {
  CP1: "CP2",
  CP2: "CE1",
  CE1: "CE2",
  CE2: "CM1",
  CM1: "CM2",
};

export interface ClosureClassOption {
  id: string;
  name: string;
  levelId: string;
  levelCode: string;
  capacity: number;
  studentCount: number;
  schoolYearId: string;
}

export interface ClosureStudentRow extends SchoolYearClosureDecisionInput {
  firstName: string;
  lastName: string;
  sourceClassName: string;
  sourceLevelCode: string;
}

export interface ClosurePreview {
  total: number;
  pending: number;
  promoted: number;
  repeated: number;
  graduated: number;
  transferred: number;
  withdrawn: number;
  errors: string[];
}

type DatabaseClassRow = {
  id: string;
  name: string;
  level_id: string | null;
  school_year_id: string;
  capacity: number;
  student_count: number;
  levels?: { code?: string } | Array<{ code?: string }> | null;
};

function relationCode(levels: DatabaseClassRow["levels"]): string {
  const level = Array.isArray(levels) ? levels[0] : levels;
  return (level?.code ?? "").toUpperCase();
}

function sectionSuffix(name: string): string {
  const normalized = name.trim().toLowerCase();
  const match = normalized.match(/(?:[-_\s])([a-z0-9]+)$/i);
  return match?.[1] ?? "";
}

function pickTargetClass(
  sourceClassName: string,
  wantedLevel: string,
  targetClasses: ClosureClassOption[],
): string | undefined {
  const candidates = targetClasses.filter((classe) => classe.levelCode === wantedLevel);
  if (candidates.length === 0) return undefined;
  const suffix = sectionSuffix(sourceClassName);
  const sameSection = suffix
    ? candidates.find((classe) => sectionSuffix(classe.name) === suffix)
    : undefined;
  return (sameSection ?? [...candidates].sort((a, b) => a.studentCount - b.studentCount)[0]).id;
}

function resultFromRpc(value: unknown): SchoolYearClosureResult {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  return {
    total: Number(row?.total ?? 0),
    promoted: Number(row?.promoted ?? 0),
    repeated: Number(row?.repeated ?? 0),
    graduated: Number(row?.graduated ?? 0),
    transferred: Number(row?.transferred ?? 0),
    withdrawn: Number(row?.withdrawn ?? 0),
  };
}

export function useSchoolYearClosure() {
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const storeClasses = useAppStore((state) => state.classes);
  const storeStudents = useAppStore((state) => state.students);
  const storeLevels = useAppStore((state) => state.levels);
  const prepareDemoClasses = useAppStore((state) => state.prepareDemoSchoolYearClosure);
  const finalizeDemo = useAppStore((state) => state.finalizeSchoolYearClosure);

  const [rows, setRows] = useState<ClosureStudentRow[]>([]);
  const [targetClasses, setTargetClasses] = useState<ClosureClassOption[]>([]);
  const [sourceYearId, setSourceYearId] = useState("");
  const [targetYearId, setTargetYearId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildDemoRows = useCallback((sourceId: string, targetId: string, preparedTargetClasses: typeof storeClasses) => {
    const levelCodeById = new Map(storeLevels.map((level) => [level.id, level.code.toUpperCase()]));
    const sourceClasses = storeClasses.filter(
      (classe) => classe.schoolYearId === sourceId && !classe.isArchived,
    );
    const nextTargetClasses = preparedTargetClasses
      .filter((classe) => !classe.isArchived)
      .map<ClosureClassOption>((classe) => ({
        id: classe.id,
        name: classe.name,
        levelId: classe.levelId,
        levelCode: levelCodeById.get(classe.levelId) ?? "",
        capacity: classe.capacity,
        studentCount: classe.studentCount,
        schoolYearId: classe.schoolYearId,
      }));

    setTargetClasses(nextTargetClasses);
    const classById = new Map(sourceClasses.map((classe) => [classe.id, classe]));
    const nextRows = storeStudents
      .filter((student) => classById.has(student.classId))
      .map<ClosureStudentRow>((student) => {
        const sourceClass = classById.get(student.classId)!;
        const sourceLevelCode = levelCodeById.get(sourceClass.levelId) ?? "";
        const nextLevel = NEXT_LEVEL[sourceLevelCode];
        const decision: PromotionDecision = sourceLevelCode === "CM2" ? "graduate" : "promote";
        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          sourceClassId: sourceClass.id,
          sourceClassName: sourceClass.name,
          sourceLevelCode,
          decision,
          targetClassId: nextLevel
            ? pickTargetClass(sourceClass.name, nextLevel, nextTargetClasses)
            : undefined,
          notes: "",
        };
      })
      .sort((a, b) => a.sourceClassName.localeCompare(b.sourceClassName) || a.lastName.localeCompare(b.lastName));
    setRows(nextRows);
  }, [storeClasses, storeLevels, storeStudents]);

  const loadRealRows = useCallback(async (sourceId: string, targetId: string) => {
    if (!supabase) throw new Error("Supabase non disponible");
    const [sourceClassesRes, targetClassesRes, decisionsRes] = await Promise.all([
      supabase
        .from("classes")
        .select("id,name,level_id,school_year_id,capacity,student_count,levels(code)")
        .eq("school_year_id", sourceId)
        .eq("is_archived", false),
      supabase
        .from("classes")
        .select("id,name,level_id,school_year_id,capacity,student_count,levels(code)")
        .eq("school_year_id", targetId)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("student_promotion_decisions")
        .select("student_id,source_class_id,target_class_id,decision,notes")
        .eq("source_school_year_id", sourceId)
        .eq("target_school_year_id", targetId),
    ]);
    if (sourceClassesRes.error) throw sourceClassesRes.error;
    if (targetClassesRes.error) throw targetClassesRes.error;
    if (decisionsRes.error) throw decisionsRes.error;

    const sourceClasses = (sourceClassesRes.data ?? []) as unknown as DatabaseClassRow[];
    const nextTargetClasses = ((targetClassesRes.data ?? []) as unknown as DatabaseClassRow[]).map(
      (classe): ClosureClassOption => ({
        id: classe.id,
        name: classe.name,
        levelId: classe.level_id ?? "",
        levelCode: relationCode(classe.levels),
        capacity: classe.capacity,
        studentCount: classe.student_count,
        schoolYearId: classe.school_year_id,
      }),
    );
    setTargetClasses(nextTargetClasses);

    const sourceClassById = new Map(sourceClasses.map((classe) => [classe.id, classe]));
    const sourceClassIds = sourceClasses.map((classe) => classe.id);
    const studentsRes = sourceClassIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("students")
          .select("id,first_name,last_name,class_id")
          .in("class_id", sourceClassIds)
          .eq("is_archived", false)
          .order("last_name");
    if (studentsRes.error) throw studentsRes.error;

    const decisionByStudent = new Map(
      (decisionsRes.data ?? []).map((decision) => [decision.student_id, decision]),
    );
    const nextRows = (studentsRes.data ?? []).map<ClosureStudentRow>((student) => {
      const sourceClass = sourceClassById.get(student.class_id)!;
      const sourceLevelCode = relationCode(sourceClass.levels);
      const saved = decisionByStudent.get(student.id);
      let decision = (saved?.decision ?? "pending") as PromotionDecision;
      let targetClassId = saved?.target_class_id ?? undefined;
      if (decision === "pending") {
        decision = sourceLevelCode === "CM2" ? "graduate" : "promote";
        targetClassId = NEXT_LEVEL[sourceLevelCode]
          ? pickTargetClass(sourceClass.name, NEXT_LEVEL[sourceLevelCode], nextTargetClasses)
          : undefined;
      }
      return {
        studentId: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        sourceClassId: sourceClass.id,
        sourceClassName: sourceClass.name,
        sourceLevelCode,
        decision,
        targetClassId,
        notes: saved?.notes ?? "",
      };
    });
    setRows(nextRows);
  }, []);

  const prepare = useCallback(async (sourceId: string, targetId: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!sourceId || !targetId) throw new Error("Sélectionnez l'année scolaire suivante.");
      setSourceYearId(sourceId);
      setTargetYearId(targetId);
      if (isDemo) {
        const preparedClasses = prepareDemoClasses(sourceId, targetId);
        buildDemoRows(sourceId, targetId, preparedClasses);
      } else {
        if (!supabase) throw new Error("Supabase non disponible");
        const { error: rpcError } = await supabase.rpc("prepare_school_year_closure", {
          p_source_year_id: sourceId,
          p_target_year_id: targetId,
        });
        if (rpcError) throw rpcError;
        await loadRealRows(sourceId, targetId);
      }
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Impossible de préparer la clôture.";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [buildDemoRows, isDemo, loadRealRows, prepareDemoClasses]);

  const updateDecision = useCallback((studentId: string, decision: PromotionDecision) => {
    setRows((current) => current.map((row) => {
      if (row.studentId !== studentId) return row;
      const wantedLevel = decision === "promote" ? NEXT_LEVEL[row.sourceLevelCode] : row.sourceLevelCode;
      return {
        ...row,
        decision,
        targetClassId: decision === "promote" || decision === "repeat"
          ? pickTargetClass(row.sourceClassName, wantedLevel ?? "", targetClasses)
          : undefined,
      };
    }));
  }, [targetClasses]);

  const updateTargetClass = useCallback((studentId: string, targetClassId: string) => {
    setRows((current) => current.map((row) => row.studentId === studentId
      ? { ...row, targetClassId }
      : row));
  }, []);

  const updateNotes = useCallback((studentId: string, notes: string) => {
    setRows((current) => current.map((row) => row.studentId === studentId ? { ...row, notes } : row));
  }, []);

  const preview = useMemo<ClosurePreview>(() => {
    const errors: string[] = [];
    const targetClassById = new Map(targetClasses.map((classe) => [classe.id, classe]));
    const incomingByClass = new Map<string, number>();
    for (const row of rows) {
      if (row.decision === "pending") {
        errors.push(`${row.firstName} ${row.lastName}: décision manquante.`);
        continue;
      }
      if (row.decision !== "promote" && row.decision !== "repeat") continue;
      if (!row.targetClassId) {
        errors.push(`${row.firstName} ${row.lastName}: classe de destination manquante.`);
        continue;
      }
      const targetClass = targetClassById.get(row.targetClassId);
      const expectedLevel = row.decision === "repeat" ? row.sourceLevelCode : NEXT_LEVEL[row.sourceLevelCode];
      if (!targetClass || targetClass.levelCode !== expectedLevel) {
        errors.push(`${row.firstName} ${row.lastName}: transition de niveau invalide.`);
        continue;
      }
      incomingByClass.set(targetClass.id, (incomingByClass.get(targetClass.id) ?? 0) + 1);
    }
    for (const row of rows) {
      if (row.decision === "graduate" && row.sourceLevelCode !== "CM2") {
        errors.push(`${row.firstName} ${row.lastName}: la fin de cycle est réservée au niveau CM2.`);
      }
    }
    for (const [classId, incoming] of incomingByClass) {
      const targetClass = targetClassById.get(classId)!;
      if (targetClass.studentCount + incoming > targetClass.capacity) {
        errors.push(`${targetClass.name}: capacité dépassée (${targetClass.studentCount + incoming}/${targetClass.capacity}).`);
      }
    }
    return {
      total: rows.length,
      pending: rows.filter((row) => row.decision === "pending").length,
      promoted: rows.filter((row) => row.decision === "promote").length,
      repeated: rows.filter((row) => row.decision === "repeat").length,
      graduated: rows.filter((row) => row.decision === "graduate").length,
      transferred: rows.filter((row) => row.decision === "transfer").length,
      withdrawn: rows.filter((row) => row.decision === "withdraw").length,
      errors,
    };
  }, [rows, targetClasses]);

  const saveDecisions = useCallback(async () => {
    if (isDemo) return;
    if (!supabase || !sourceYearId || !targetYearId) throw new Error("Clôture non préparée.");
    const now = new Date().toISOString();
    const payload = rows.map((row) => ({
      student_id: row.studentId,
      source_school_year_id: sourceYearId,
      source_class_id: row.sourceClassId,
      target_school_year_id: targetYearId,
      target_class_id: row.decision === "promote" || row.decision === "repeat" ? row.targetClassId ?? null : null,
      decision: row.decision,
      notes: row.notes?.trim() || null,
      decided_by: row.decision === "pending" ? null : user?.id ?? null,
      decided_at: row.decision === "pending" ? null : now,
      updated_at: now,
    }));
    if (payload.length === 0) return;
    const { error: saveError } = await supabase
      .from("student_promotion_decisions")
      .upsert(payload, { onConflict: "student_id,source_school_year_id" });
    if (saveError) throw saveError;
  }, [isDemo, rows, sourceYearId, targetYearId, user?.id]);

  const finalize = useCallback(async (): Promise<SchoolYearClosureResult> => {
    setSaving(true);
    setError(null);
    try {
      if (preview.errors.length > 0) throw new Error("Corrigez les erreurs avant de clôturer l'année.");
      if (isDemo) {
        return finalizeDemo(sourceYearId, targetYearId, rows);
      }
      await saveDecisions();
      if (!supabase) throw new Error("Supabase non disponible");
      const { data, error: rpcError } = await supabase.rpc("finalize_school_year_closure", {
        p_source_year_id: sourceYearId,
        p_target_year_id: targetYearId,
      });
      if (rpcError) throw rpcError;
      return resultFromRpc(data);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Échec de la clôture de l'année scolaire.";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [finalizeDemo, isDemo, preview.errors.length, rows, saveDecisions, sourceYearId, targetYearId]);

  const reset = useCallback(() => {
    setRows([]);
    setTargetClasses([]);
    setSourceYearId("");
    setTargetYearId("");
    setError(null);
    setLoading(false);
    setSaving(false);
  }, []);

  return {
    rows,
    targetClasses,
    preview,
    loading,
    saving,
    error,
    prepared: Boolean(sourceYearId && targetYearId),
    sourceYearId,
    targetYearId,
    prepare,
    updateDecision,
    updateTargetClass,
    updateNotes,
    saveDecisions,
    finalize,
    reset,
  };
}
