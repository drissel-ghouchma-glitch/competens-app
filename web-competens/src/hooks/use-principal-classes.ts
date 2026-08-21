import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import { isMissingSkillRecoveryTable } from "@/lib/skill-recovery";
import { competencyScoreFromLedger, type PenaltyLedgerEvent } from "@/lib/eval-utils";
import type { Classe, Competency, SkillRecoveryAction, Student } from "@/types";
import type { RecoverySubmission } from "@/components/SkillRecoveryDialog";

export type Belt = "white" | "yellow" | "green" | "blue";

export interface PrincipalSkillScore {
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  acquisitionRate: number;
  totalEvaluations: number;
  isArchived: boolean;
}

export interface PrincipalStudent extends Student {
  score: number;
  penaltyCount: number;
  skills: PrincipalSkillScore[];
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

function mapRecovery(row: {
  id: string; student_id: string; competency_id: string; class_id: string; action_type: "increase" | "reset_to_100";
  previous_score: number; new_score: number; meeting_date: string; student_reason: string; meeting_notes: string;
  created_by: string; created_at: string; profiles: { full_name?: string } | null;
}): SkillRecoveryAction {
  return {
    id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
    actionType: row.action_type, previousScore: row.previous_score, newScore: row.new_score,
    meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
    createdBy: row.created_by, createdByName: row.profiles?.full_name, createdAt: row.created_at,
  };
}

/** Principal-teacher class overview, including the immutable recovery ledger. */
export function usePrincipalClasses() {
  const { user } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const storeClasses = useAppStore((s) => s.classes);
  const storeStudents = useAppStore((s) => s.students);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeRecoveries = useAppStore((s) => s.skillRecoveryActions);
  const storeTeachers = useAppStore((s) => s.teachers);
  const addDemoRecovery = useAppStore((s) => s.addDemoSkillRecoveryAction);

  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [sbPenalties, setSbPenalties] = useState<PenaltyLedgerEvent[]>([]);
  const [sbRecoveries, setSbRecoveries] = useState<SkillRecoveryAction[]>([]);
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
    setSelectedClassId((current) => current && principalClasses.some((classe) => classe.id === current)
      ? current
      : principalClasses[0]?.id ?? "");
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
        id: classe.id, name: classe.name, levelId: classe.level_id ?? "", teacherId: classe.teacher_id ?? undefined,
        capacity: classe.capacity, studentCount: classe.student_count, isArchived: classe.is_archived,
        schoolYearId: classe.school_year_id, createdAt: classe.created_at,
      })));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load principal classes.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (!isDemo) fetchFromSupabase(); }, [isDemo, fetchFromSupabase]);

  const fetchSelectedClassData = useCallback(async () => {
    if (isDemo || !supabase || !selectedClassId || user?.role !== "professeur") return;
    setLoading(true);
    setError(null);
    try {
      const { data: ownedClass, error: ownedClassError } = await supabase
        .from("classes").select("id").eq("id", selectedClassId).eq("teacher_id", user.id).eq("is_archived", false).maybeSingle();
      if (ownedClassError) throw ownedClassError;
      if (!ownedClass) {
        setSbStudents([]); setSbPenalties([]); setSbRecoveries([]); return;
      }

      const [studentsResult, competenciesResult, evaluationsResult, recoveriesResult] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", selectedClassId).order("last_name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("evaluations").select("id, student_id, competency_id, teacher_id, date, created_at, profiles(full_name)").eq("class_id", selectedClassId),
        supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at, profiles(full_name)").eq("class_id", selectedClassId),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (competenciesResult.error) throw competenciesResult.error;
      if (evaluationsResult.error) throw evaluationsResult.error;
      if (recoveriesResult.error && !isMissingSkillRecoveryTable(recoveriesResult.error)) throw recoveriesResult.error;

      setSbStudents((studentsResult.data ?? []).map(mapStudent));
      setSbCompetencies((competenciesResult.data ?? []).map((competency) => ({
        id: competency.id, code: competency.code, title: competency.title, description: competency.description ?? "",
        pedagogicalAdvice: competency.pedagogical_advice ?? "", order: competency.order,
        isArchived: competency.is_archived ?? false, createdAt: competency.created_at,
      })));
      setSbPenalties((evaluationsResult.data ?? []).map((evaluation) => ({
        id: evaluation.id, studentId: evaluation.student_id, competencyId: evaluation.competency_id,
        date: evaluation.date, createdAt: evaluation.created_at, teacherId: evaluation.teacher_id,
        teacherName: (evaluation.profiles as { full_name?: string } | null)?.full_name,
      })));
      setSbRecoveries(recoveriesResult.error ? [] : (recoveriesResult.data ?? []).map((row) => mapRecovery(row as Parameters<typeof mapRecovery>[0])));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load class analytics.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, selectedClassId, user?.id, user?.role]);

  useEffect(() => { fetchSelectedClassData(); }, [fetchSelectedClassData]);

  const students = useMemo(() => isDemo ? storeStudents.filter((student) => student.classId === selectedClassId) : sbStudents,
    [isDemo, storeStudents, selectedClassId, sbStudents]);
  const competencies = isDemo ? storeCompetencies : sbCompetencies;
  const penalties = useMemo<PenaltyLedgerEvent[]>(() => isDemo
    ? storeEvaluations
        .filter((evaluation) => evaluation.classId === selectedClassId)
        .map((evaluation) => {
          const teacher = storeTeachers.find((item) => item.id === evaluation.teacherId);
          return { ...evaluation, teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : undefined };
        })
    : sbPenalties, [isDemo, storeEvaluations, selectedClassId, storeTeachers, sbPenalties]);
  const recoveries = useMemo(() => isDemo
    ? storeRecoveries.filter((action) => action.classId === selectedClassId)
    : sbRecoveries, [isDemo, storeRecoveries, selectedClassId, sbRecoveries]);

  const studentScores = useMemo<PrincipalStudent[]>(() => students.map((student) => {
    const studentPenalties = penalties.filter((penalty) => penalty.studentId === student.id);
    const skills = competencies.map((competency) => {
      const competencyPenalties = studentPenalties.filter((penalty) => penalty.competencyId === competency.id);
      return {
        competencyId: competency.id, competencyCode: competency.code, competencyTitle: competency.title,
        acquisitionRate: competencyScoreFromLedger(penalties, recoveries, student.id, competency.id),
        totalEvaluations: competencyPenalties.length, isArchived: competency.isArchived,
      };
    });
    const activeSkills = skills.filter((skill) => !skill.isArchived);
    const score = activeSkills.length === 0 ? 0 : Math.round(activeSkills.reduce((sum, skill) => sum + skill.acquisitionRate, 0) / activeSkills.length);
    return { ...student, score, penaltyCount: studentPenalties.length, skills };
  }).sort((left, right) => right.score - left.score || left.lastName.localeCompare(right.lastName)), [students, penalties, recoveries, competencies]);

  const beltGroups = useMemo<BeltGroups>(() => {
    const groups = emptyBeltGroups();
    for (const student of studentScores) groups[beltForScore(student.score)].push(student);
    return groups;
  }, [studentScores]);

  const selectedClass = useMemo(() => principalClasses.find((classe) => classe.id === selectedClassId) ?? null, [principalClasses, selectedClassId]);

  const createRecoveryAction = useCallback(async (student: PrincipalStudent, submission: RecoverySubmission) => {
    if (!selectedClassId) throw new Error("Class is required.");
    const selectedSkill = student.skills.find((skill) => skill.competencyId === submission.competencyId);
    if (!selectedSkill) throw new Error("Skill is not available.");

    if (isDemo) {
      if (submission.newScore <= selectedSkill.acquisitionRate) throw new Error("The new score must be strictly greater than the current score.");
      if (submission.actionType === "reset_to_100" && submission.newScore !== 100) throw new Error("A reset must set the score to 100.");
      addDemoRecovery({
        studentId: student.id, competencyId: submission.competencyId, classId: selectedClassId,
        actionType: submission.actionType, previousScore: selectedSkill.acquisitionRate, newScore: submission.newScore,
        meetingDate: submission.meetingDate, studentReason: submission.studentReason, meetingNotes: submission.meetingNotes,
        createdBy: user?.id ?? selectedClass?.teacherId ?? "demo-principal", createdByName: user?.fullName,
      });
      return;
    }
    if (!supabase) throw new Error("Supabase is unavailable.");
    const { error: rpcError } = await supabase.rpc("create_skill_recovery_action", {
      p_student_id: student.id, p_competency_id: submission.competencyId, p_action_type: submission.actionType,
      p_new_score: submission.newScore, p_meeting_date: submission.meetingDate,
      p_student_reason: submission.studentReason, p_meeting_notes: submission.meetingNotes,
    });
    if (rpcError) throw new Error(rpcError.message);
    await fetchSelectedClassData();
  }, [selectedClassId, isDemo, addDemoRecovery, user, selectedClass?.teacherId, fetchSelectedClassData]);

  const refetch = useCallback(async () => {
    if (isDemo) return;
    await fetchFromSupabase();
    await fetchSelectedClassData();
  }, [isDemo, fetchFromSupabase, fetchSelectedClassData]);

  return {
    principalClasses, selectedClass, selectedClassId, setSelectedClassId, students, competencies,
    penalties, recoveries, studentScores, beltGroups, loading, error, createRecoveryAction, refetch,
  };
}
