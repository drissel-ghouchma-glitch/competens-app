import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import type { Classe, Competency, Student } from "@/types";

export type Belt = "white" | "yellow" | "green" | "blue";

export interface PrincipalStudent extends Student {
  score: number;
  penaltyCount: number;
}

export type BeltGroups = Record<Belt, PrincipalStudent[]>;

const emptyBeltGroups = (): BeltGroups => ({ white: [], yellow: [], green: [], blue: [] });

function beltForScore(score: number): Belt {
  if (score < 50) return "white";
  if (score < 90) return "yellow";
  if (score < 99) return "green";
  return "blue";
}

function mapStudent(row: {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  gender: string | null; class_id: string | null; photo_url: string | null; created_at: string;
}): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date ?? "",
    gender: (row.gender ?? "M") as "M" | "F",
    classId: row.class_id ?? "",
    photoUrl: row.photo_url ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Read-only class overview for a teacher who is the principal teacher.
 * A student's score is the rounded average of all competency scores, where a
 * competency score is 100 minus its number of penalty events. This is the
 * same calculation used by the existing student and parent analytics.
 */
export function usePrincipalClasses() {
  const { user } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const storeClasses = useAppStore((s) => s.classes);
  const storeStudents = useAppStore((s) => s.students);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);

  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [penaltyRows, setPenaltyRows] = useState<Array<{ studentId: string; competencyId: string }>>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoTeacherId = user?.id ?? storeClasses.find((classe) => classe.teacherId)?.teacherId;
  const principalClasses = useMemo(() => {
    const source = isDemo ? storeClasses : sbClasses;
    const teacherId = isDemo ? demoTeacherId : user?.id;
    return source.filter((classe) => !classe.isArchived && classe.teacherId === teacherId);
  }, [isDemo, storeClasses, sbClasses, demoTeacherId, user?.id]);

  useEffect(() => {
    setSelectedClassId((current) => {
      if (current && principalClasses.some((classe) => classe.id === current)) return current;
      return principalClasses[0]?.id ?? "";
    });
  }, [principalClasses]);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !user || user.role !== "professeur") return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: classesError } = await supabase
        .from("classes")
        .select("id, name, level_id, teacher_id, capacity, student_count, is_archived, school_year_id, created_at")
        .eq("teacher_id", user.id)
        .eq("is_archived", false)
        .order("name");
      if (classesError) throw classesError;

      setSbClasses((data ?? []).map((classe) => ({
        id: classe.id,
        name: classe.name,
        levelId: classe.level_id ?? "",
        teacherId: classe.teacher_id ?? undefined,
        capacity: classe.capacity,
        studentCount: classe.student_count,
        isArchived: classe.is_archived,
        schoolYearId: classe.school_year_id,
        createdAt: classe.created_at,
      })));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load principal classes.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  const fetchSelectedClassData = useCallback(async () => {
    if (isDemo || !supabase || !selectedClassId || user?.role !== "professeur") return;
    setLoading(true);
    setError(null);
    try {
      // The class query is intentionally repeated here: it prevents a manually
      // supplied class ID from being used unless the teacher is its principal.
      const { data: ownedClass, error: ownedClassError } = await supabase
        .from("classes")
        .select("id")
        .eq("id", selectedClassId)
        .eq("teacher_id", user.id)
        .eq("is_archived", false)
        .maybeSingle();
      if (ownedClassError) throw ownedClassError;
      if (!ownedClass) {
        setSbStudents([]);
        setPenaltyRows([]);
        return;
      }

      const [studentsResult, competenciesResult, evaluationsResult] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", selectedClassId).order("last_name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("evaluations").select("student_id, competency_id").eq("class_id", selectedClassId),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (competenciesResult.error) throw competenciesResult.error;
      if (evaluationsResult.error) throw evaluationsResult.error;

      setSbStudents((studentsResult.data ?? []).map(mapStudent));
      setSbCompetencies((competenciesResult.data ?? []).map((competency) => ({
        id: competency.id,
        code: competency.code,
        title: competency.title,
        description: competency.description ?? "",
        pedagogicalAdvice: competency.pedagogical_advice ?? "",
        order: competency.order,
        isArchived: competency.is_archived ?? false,
        createdAt: competency.created_at,
      })));
      setPenaltyRows((evaluationsResult.data ?? []).map((evaluation) => ({
        studentId: evaluation.student_id,
        competencyId: evaluation.competency_id,
      })));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load class analytics.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, selectedClassId, user?.id, user?.role]);

  useEffect(() => {
    fetchSelectedClassData();
  }, [fetchSelectedClassData]);

  const students = useMemo(() => {
    if (isDemo) return storeStudents.filter((student) => student.classId === selectedClassId);
    return sbStudents;
  }, [isDemo, storeStudents, selectedClassId, sbStudents]);

  const competencies = isDemo ? storeCompetencies : sbCompetencies;
  const penalties = useMemo(
    () => isDemo
      ? storeEvaluations
          .filter((evaluation) => evaluation.classId === selectedClassId)
          .map((evaluation) => ({ studentId: evaluation.studentId, competencyId: evaluation.competencyId }))
      : penaltyRows,
    [isDemo, storeEvaluations, selectedClassId, penaltyRows]
  );

  const studentScores = useMemo<PrincipalStudent[]>(() => {
    return students.map((student) => {
      const studentPenalties = penalties.filter((penalty) => penalty.studentId === student.id);
      const competencyScores = competencies.map((competency) => {
        const penaltyCount = studentPenalties.filter((penalty) => penalty.competencyId === competency.id).length;
        return Math.max(0, 100 - penaltyCount);
      });
      const score = competencyScores.length === 0
        ? 0
        : Math.round(competencyScores.reduce((sum, value) => sum + value, 0) / competencyScores.length);
      return { ...student, score, penaltyCount: studentPenalties.length };
    }).sort((left, right) => right.score - left.score || left.lastName.localeCompare(right.lastName));
  }, [students, penalties, competencies]);

  const beltGroups = useMemo<BeltGroups>(() => {
    const groups = emptyBeltGroups();
    for (const student of studentScores) groups[beltForScore(student.score)].push(student);
    return groups;
  }, [studentScores]);

  const selectedClass = useMemo(
    () => principalClasses.find((classe) => classe.id === selectedClassId) ?? null,
    [principalClasses, selectedClassId]
  );

  return {
    principalClasses,
    selectedClass,
    selectedClassId,
    setSelectedClassId,
    students,
    studentScores,
    beltGroups,
    loading,
    error,
    refetch: isDemo ? async () => undefined : fetchFromSupabase,
  };
}
