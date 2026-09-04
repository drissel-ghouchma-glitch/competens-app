import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import { isMissingSkillRecoveryRequestTable, isMissingSkillRecoveryTable, isQueuedSkillRecoveryResponse } from "@/lib/skill-recovery";
import { competencyScoreFromLedger, type PenaltyLedgerEvent } from "@/lib/eval-utils";
import type { Classe, Competency, SkillRecoveryAction, SkillRecoveryRequest, Student } from "@/types";
import type { RecoverySubmission, RecoverySubmissionResult } from "@/components/SkillRecoveryDialog";

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

/** Cross-class student requiring an administrative evaluation review. */
export interface ManagementReviewStudent extends PrincipalStudent {
  className: string;
  weakSkills: PrincipalSkillScore[];
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

function mapRecoveryRequest(row: {
  id: string; student_id: string; competency_id: string; class_id: string; requested_by: string;
  current_score: number; principal_reset_count: number; meeting_date: string; student_reason: string;
  meeting_notes: string; status: "pending" | "completed" | "rejected"; reviewed_by: string | null;
  reviewed_at: string | null; resolved_recovery_action_id: string | null; created_at: string;
}): SkillRecoveryRequest {
  return {
    id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
    requestedBy: row.requested_by, currentScore: row.current_score, principalResetCount: row.principal_reset_count,
    meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
    status: row.status, reviewedBy: row.reviewed_by ?? undefined, reviewedAt: row.reviewed_at ?? undefined,
    resolvedRecoveryActionId: row.resolved_recovery_action_id ?? undefined, createdAt: row.created_at,
  };
}

/** Principal-class overview. Management can inspect every active class. */
export function usePrincipalClasses() {
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const storeClasses = useAppStore((state) => state.classes);
  const storeSchoolYears = useAppStore((state) => state.schoolYears);
  const storeStudents = useAppStore((state) => state.students);
  const storeCompetencies = useAppStore((state) => state.competencies);
  const storeEvaluations = useAppStore((state) => state.evaluations);
  const storeRecoveries = useAppStore((state) => state.skillRecoveryActions);
  const storeRecoveryRequests = useAppStore((state) => state.skillRecoveryRequests);
  const storeTeachers = useAppStore((state) => state.teachers);
  const addDemoRecovery = useAppStore((state) => state.addDemoSkillRecoveryAction);
  const addDemoRecoveryRequest = useAppStore((state) => state.addDemoSkillRecoveryRequest);
  const resolveDemoRecoveryRequest = useAppStore((state) => state.resolveDemoSkillRecoveryRequest);

  const [sbClasses, setSbClasses] = useState<Classe[]>([]);
  const [sbStudents, setSbStudents] = useState<Student[]>([]);
  const [sbCompetencies, setSbCompetencies] = useState<Competency[]>([]);
  const [sbPenalties, setSbPenalties] = useState<PenaltyLedgerEvent[]>([]);
  const [sbRecoveries, setSbRecoveries] = useState<SkillRecoveryAction[]>([]);
  const [sbRecoveryRequests, setSbRecoveryRequests] = useState<SkillRecoveryRequest[]>([]);
  const [sbReviewStudents, setSbReviewStudents] = useState<Student[]>([]);
  const [sbReviewCompetencies, setSbReviewCompetencies] = useState<Competency[]>([]);
  const [sbReviewPenalties, setSbReviewPenalties] = useState<PenaltyLedgerEvent[]>([]);
  const [sbReviewRecoveries, setSbReviewRecoveries] = useState<SkillRecoveryAction[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManagement = user?.role === "admin" || user?.role === "directeur";
  const canUsePage = isManagement || user?.role === "professeur";
  const demoTeacherId = user?.id ?? storeClasses.find((classe) => classe.teacherId)?.teacherId;
  const demoActiveYearId = useMemo(
    () => storeSchoolYears.find((year) => year.isActive && !year.isClosed)?.id,
    [storeSchoolYears],
  );

  const principalClasses = useMemo(() => {
    const source = isDemo ? storeClasses : sbClasses;
    const activeClasses = source.filter((classe) => !classe.isArchived && (!isDemo || classe.schoolYearId === demoActiveYearId));
    return isManagement ? activeClasses : activeClasses.filter((classe) => classe.teacherId === (isDemo ? demoTeacherId : user?.id));
  }, [demoActiveYearId, demoTeacherId, isDemo, isManagement, sbClasses, storeClasses, user?.id]);

  useEffect(() => {
    setSelectedClassId((current) => {
      if (isManagement) return current && principalClasses.some((classe) => classe.id === current) ? current : "";
      return current && principalClasses.some((classe) => classe.id === current) ? current : principalClasses[0]?.id ?? "";
    });
  }, [isManagement, principalClasses]);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !user || !canUsePage) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("classes")
        .select("id, name, level_id, teacher_id, capacity, student_count, is_archived, school_year_id, created_at, school_years!inner(is_active,is_closed)")
        .eq("is_archived", false)
        .eq("school_years.is_active", true)
        .eq("school_years.is_closed", false)
        .order("name");
      if (!isManagement) query = query.eq("teacher_id", user.id);

      const { data, error: classesError } = await query;
      if (classesError) throw classesError;
      const classes = (data ?? []).map((classe) => ({
        id: classe.id, name: classe.name, levelId: classe.level_id ?? "", teacherId: classe.teacher_id ?? undefined,
        capacity: classe.capacity, studentCount: classe.student_count, isArchived: classe.is_archived,
        schoolYearId: classe.school_year_id, createdAt: classe.created_at,
      }));
      setSbClasses(classes);

      if (isManagement) {
        const classIds = classes.map((classe) => classe.id);
        if (classIds.length === 0) {
          setSbReviewStudents([]); setSbReviewCompetencies([]); setSbReviewPenalties([]); setSbReviewRecoveries([]);
        } else {
          const [studentsResult, competenciesResult, evaluationsResult, recoveriesResult] = await Promise.all([
            supabase.from("students").select("*").in("class_id", classIds).eq("is_archived", false).order("last_name"),
            supabase.from("competencies").select("*").order("order"),
            supabase.from("evaluations").select("id, student_id, competency_id, teacher_id, date, created_at, profiles(full_name)").in("class_id", classIds),
            supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at, profiles(full_name)").in("class_id", classIds),
          ]);
          if (studentsResult.error) throw studentsResult.error;
          if (competenciesResult.error) throw competenciesResult.error;
          if (evaluationsResult.error) throw evaluationsResult.error;
          if (recoveriesResult.error && !isMissingSkillRecoveryTable(recoveriesResult.error)) throw recoveriesResult.error;

          setSbReviewStudents((studentsResult.data ?? []).map(mapStudent));
          setSbReviewCompetencies((competenciesResult.data ?? []).map((competency) => ({
            id: competency.id, code: competency.code, title: competency.title, description: competency.description ?? "",
            pedagogicalAdvice: competency.pedagogical_advice ?? "", order: competency.order,
            isArchived: competency.is_archived ?? false, createdAt: competency.created_at,
          })));
          setSbReviewPenalties((evaluationsResult.data ?? []).map((evaluation) => ({
            id: evaluation.id, studentId: evaluation.student_id, competencyId: evaluation.competency_id,
            date: evaluation.date, createdAt: evaluation.created_at, teacherId: evaluation.teacher_id,
            teacherName: (evaluation.profiles as { full_name?: string } | null)?.full_name,
          })));
          setSbReviewRecoveries(recoveriesResult.error ? [] : (recoveriesResult.data ?? []).map((row) => mapRecovery(row as Parameters<typeof mapRecovery>[0])));
        }
      } else {
        setSbReviewStudents([]); setSbReviewCompetencies([]); setSbReviewPenalties([]); setSbReviewRecoveries([]);
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load classes.");
    } finally {
      setLoading(false);
    }
  }, [canUsePage, isManagement, user]);

  useEffect(() => { if (!isDemo) void fetchFromSupabase(); }, [fetchFromSupabase, isDemo]);

  const fetchSelectedClassData = useCallback(async () => {
    if (isDemo || !supabase || !selectedClassId || !user || !canUsePage) return;
    setLoading(true);
    setError(null);
    try {
      let classQuery = supabase.from("classes").select("id").eq("id", selectedClassId).eq("is_archived", false);
      if (!isManagement) classQuery = classQuery.eq("teacher_id", user.id);
      const { data: accessibleClass, error: classError } = await classQuery.maybeSingle();
      if (classError) throw classError;
      if (!accessibleClass) {
        setSbStudents([]); setSbPenalties([]); setSbRecoveries([]); setSbRecoveryRequests([]);
        return;
      }

      const [studentsResult, competenciesResult, evaluationsResult, recoveriesResult, requestsResult] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", selectedClassId).order("last_name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("evaluations").select("id, student_id, competency_id, teacher_id, date, created_at, profiles(full_name)").eq("class_id", selectedClassId),
        supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at, profiles(full_name)").eq("class_id", selectedClassId),
        supabase.from("skill_recovery_requests").select("id, student_id, competency_id, class_id, requested_by, current_score, principal_reset_count, meeting_date, student_reason, meeting_notes, status, reviewed_by, reviewed_at, resolved_recovery_action_id, created_at").eq("class_id", selectedClassId).eq("status", "pending").order("created_at"),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (competenciesResult.error) throw competenciesResult.error;
      if (evaluationsResult.error) throw evaluationsResult.error;
      if (recoveriesResult.error && !isMissingSkillRecoveryTable(recoveriesResult.error)) throw recoveriesResult.error;
      if (requestsResult.error && !isMissingSkillRecoveryRequestTable(requestsResult.error)) throw requestsResult.error;

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
      setSbRecoveryRequests(requestsResult.error ? [] : (requestsResult.data ?? []).map((row) => mapRecoveryRequest(row as Parameters<typeof mapRecoveryRequest>[0])));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load class analytics.");
    } finally {
      setLoading(false);
    }
  }, [canUsePage, isDemo, isManagement, selectedClassId, user]);

  useEffect(() => { void fetchSelectedClassData(); }, [fetchSelectedClassData]);

  const students = useMemo(() => isDemo ? storeStudents.filter((student) => student.classId === selectedClassId) : sbStudents,
    [isDemo, sbStudents, selectedClassId, storeStudents]);
  const competencies = isDemo ? storeCompetencies : sbCompetencies;
  const penalties = useMemo<PenaltyLedgerEvent[]>(() => isDemo
    ? storeEvaluations
      .filter((evaluation) => evaluation.classId === selectedClassId)
      .map((evaluation) => {
        const teacher = storeTeachers.find((item) => item.id === evaluation.teacherId);
        return { ...evaluation, teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : undefined };
      })
    : sbPenalties, [isDemo, sbPenalties, selectedClassId, storeEvaluations, storeTeachers]);
  const recoveries = useMemo(() => isDemo
    ? storeRecoveries.filter((action) => action.classId === selectedClassId)
    : sbRecoveries, [isDemo, sbRecoveries, selectedClassId, storeRecoveries]);
  const recoveryRequests = useMemo(() => isDemo
    ? storeRecoveryRequests.filter((request) => request.classId === selectedClassId && request.status === "pending")
    : sbRecoveryRequests, [isDemo, sbRecoveryRequests, selectedClassId, storeRecoveryRequests]);

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
  }).sort((left, right) => right.score - left.score || left.lastName.localeCompare(right.lastName)), [competencies, penalties, recoveries, students]);

  const managementReviewStudents = useMemo<ManagementReviewStudent[]>(() => {
    if (!isManagement) return [];
    const classNameById = new Map(principalClasses.map((classe) => [classe.id, classe.name]));
    const reviewStudents = isDemo
      ? storeStudents.filter((student) => classNameById.has(student.classId))
      : sbReviewStudents;
    const reviewCompetencies = isDemo ? storeCompetencies : sbReviewCompetencies;
    const reviewPenalties = isDemo
      ? storeEvaluations.filter((evaluation) => classNameById.has(evaluation.classId))
      : sbReviewPenalties;
    const reviewRecoveries = isDemo
      ? storeRecoveries.filter((action) => classNameById.has(action.classId))
      : sbReviewRecoveries;

    return reviewStudents.map((student) => {
      const studentPenalties = reviewPenalties.filter((penalty) => penalty.studentId === student.id);
      const skills = reviewCompetencies.map((competency) => ({
        competencyId: competency.id,
        competencyCode: competency.code,
        competencyTitle: competency.title,
        acquisitionRate: competencyScoreFromLedger(reviewPenalties, reviewRecoveries, student.id, competency.id),
        totalEvaluations: studentPenalties.filter((penalty) => penalty.competencyId === competency.id).length,
        isArchived: competency.isArchived,
      }));
      const activeSkills = skills.filter((skill) => !skill.isArchived);
      const score = activeSkills.length === 0 ? 0 : Math.round(activeSkills.reduce((sum, skill) => sum + skill.acquisitionRate, 0) / activeSkills.length);
      const weakSkills = activeSkills.filter((skill) => skill.acquisitionRate < 90);
      return {
        ...student,
        score,
        penaltyCount: studentPenalties.length,
        skills,
        weakSkills,
        className: classNameById.get(student.classId) ?? "—",
      };
    }).filter((student) => student.score < 99 || (student.score >= 99 && student.weakSkills.length > 0))
      .sort((left, right) => left.score - right.score || left.lastName.localeCompare(right.lastName));
  }, [isDemo, isManagement, principalClasses, sbReviewCompetencies, sbReviewPenalties, sbReviewRecoveries, sbReviewStudents, storeCompetencies, storeEvaluations, storeRecoveries, storeStudents]);

  const beltGroups = useMemo<BeltGroups>(() => {
    const groups = emptyBeltGroups();
    for (const student of studentScores) groups[beltForScore(student.score)].push(student);
    return groups;
  }, [studentScores]);

  const selectedClass = useMemo(() => principalClasses.find((classe) => classe.id === selectedClassId) ?? null, [principalClasses, selectedClassId]);

  const createRecoveryAction = useCallback(async (student: PrincipalStudent, submission: RecoverySubmission): Promise<RecoverySubmissionResult> => {
    if (!selectedClassId) throw new Error("Class is required.");
    const selectedSkill = student.skills.find((skill) => skill.competencyId === submission.competencyId);
    if (!selectedSkill) throw new Error("Skill is not available.");
    if (submission.newScore <= selectedSkill.acquisitionRate) throw new Error("The new score must be strictly greater than the current score.");
    if (submission.actionType === "reset_to_100" && submission.newScore !== 100) throw new Error("A reset must set the score to 100.");

    if (isDemo) {
      const principalResetCount = storeRecoveries.filter((action) =>
        action.classId === selectedClassId && action.studentId === student.id && action.competencyId === submission.competencyId
        && action.actionType === "reset_to_100" && action.createdBy === selectedClass?.teacherId
      ).length;
      if (!isManagement && submission.actionType === "reset_to_100" && principalResetCount >= 2) {
        addDemoRecoveryRequest({
          studentId: student.id, competencyId: submission.competencyId, classId: selectedClassId,
          requestedBy: user?.id ?? selectedClass?.teacherId ?? "demo-principal", requestedByName: user?.fullName,
          currentScore: selectedSkill.acquisitionRate, principalResetCount,
          meetingDate: submission.meetingDate, studentReason: submission.studentReason, meetingNotes: submission.meetingNotes,
        });
        return "admin_review_required";
      }

      addDemoRecovery({
        studentId: student.id, competencyId: submission.competencyId, classId: selectedClassId,
        actionType: submission.actionType, previousScore: selectedSkill.acquisitionRate, newScore: submission.newScore,
        meetingDate: submission.meetingDate, studentReason: submission.studentReason, meetingNotes: submission.meetingNotes,
        createdBy: user?.id ?? selectedClass?.teacherId ?? "demo-principal", createdByName: user?.fullName,
      });
      if (isManagement && submission.actionType === "reset_to_100") {
        resolveDemoRecoveryRequest(student.id, submission.competencyId, selectedClassId, user?.id ?? "demo-management");
      }
      return "completed";
    }

    if (!supabase) throw new Error("Supabase is unavailable.");
    const { data, error: rpcError } = await supabase.rpc("create_skill_recovery_action", {
      p_student_id: student.id, p_competency_id: submission.competencyId, p_action_type: submission.actionType,
      p_new_score: submission.newScore, p_meeting_date: submission.meetingDate,
      p_student_reason: submission.studentReason, p_meeting_notes: submission.meetingNotes,
    });
    if (rpcError) throw new Error(rpcError.message);
    await fetchSelectedClassData();
    return isQueuedSkillRecoveryResponse(data) ? "admin_review_required" : "completed";
  }, [addDemoRecovery, addDemoRecoveryRequest, fetchSelectedClassData, isDemo, isManagement, resolveDemoRecoveryRequest, selectedClass?.teacherId, selectedClassId, storeRecoveries, user]);

  const refetch = useCallback(async () => {
    if (isDemo) return;
    await fetchFromSupabase();
    await fetchSelectedClassData();
  }, [fetchFromSupabase, fetchSelectedClassData, isDemo]);

  return {
    principalClasses, selectedClass, selectedClassId, setSelectedClassId, students, competencies,
    penalties, recoveries, recoveryRequests, studentScores, managementReviewStudents, beltGroups, isManagement,
    loading, error, createRecoveryAction, refetch,
  };
}
