import { useCallback, useEffect, useMemo, useState } from "react";
import { competencyScoreFromLedger, type PenaltyLedgerEvent } from "@/lib/eval-utils";
import { isMissingSkillRecoveryTable } from "@/lib/skill-recovery";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/stores/app-store";
import { useDemoStore } from "@/stores/demo";
import type { Competency, EnrollmentStatus, SchoolYear, SkillRecoveryAction, Student } from "@/types";

export interface ArchiveClass {
  id: string;
  name: string;
  levelCode: string;
  capacity: number;
}

export interface ArchiveSkill {
  competencyId: string;
  code: string;
  title: string;
  score: number;
  penaltyCount: number;
}

export interface ArchiveStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  levelCode: string;
  enrollmentStatus: EnrollmentStatus;
  average: number;
  evaluationCount: number;
  attendanceCount: number;
  absenceCount: number;
  skills: ArchiveSkill[];
}

interface ArchiveEnrollment {
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
}

interface ArchiveAttendance {
  studentId: string;
  status: "present" | "absent";
}

function buildArchiveStudents(
  enrollments: ArchiveEnrollment[],
  students: Student[],
  classes: ArchiveClass[],
  competencies: Competency[],
  penalties: PenaltyLedgerEvent[],
  recoveries: SkillRecoveryAction[],
  attendance: ArchiveAttendance[],
): ArchiveStudent[] {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const classById = new Map(classes.map((classe) => [classe.id, classe]));

  return enrollments.map((enrollment) => {
    const student = studentById.get(enrollment.studentId);
    const archiveClass = classById.get(enrollment.classId);
    const studentPenalties = penalties.filter((penalty) => penalty.studentId === enrollment.studentId);
    const studentAttendance = attendance.filter((record) => record.studentId === enrollment.studentId);
    const skills: ArchiveSkill[] = competencies.map((competency) => {
      const skillPenalties = studentPenalties.filter((penalty) => penalty.competencyId === competency.id);
      return {
        competencyId: competency.id,
        code: competency.code,
        title: competency.title,
        score: competencyScoreFromLedger(penalties, recoveries, enrollment.studentId, competency.id),
        penaltyCount: skillPenalties.length,
      };
    });
    const average = skills.length > 0
      ? Math.round(skills.reduce((total, skill) => total + skill.score, 0) / skills.length)
      : 100;
    return {
      id: enrollment.studentId,
      firstName: student?.firstName ?? "—",
      lastName: student?.lastName ?? "",
      classId: enrollment.classId,
      className: archiveClass?.name ?? "—",
      levelCode: archiveClass?.levelCode ?? "",
      enrollmentStatus: enrollment.status,
      average,
      evaluationCount: studentPenalties.length,
      attendanceCount: studentAttendance.length,
      absenceCount: studentAttendance.filter((record) => record.status === "absent").length,
      skills,
    };
  }).sort((left, right) => left.className.localeCompare(right.className) || left.lastName.localeCompare(right.lastName));
}

export function useSchoolYearArchive(yearId: string | undefined) {
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const storeYears = useAppStore((state) => state.schoolYears);
  const storeClasses = useAppStore((state) => state.classes);
  const storeLevels = useAppStore((state) => state.levels);
  const storeStudents = useAppStore((state) => state.students);
  const storeEnrollments = useAppStore((state) => state.studentEnrollments);
  const storeCompetencies = useAppStore((state) => state.competencies);
  const storeEvaluations = useAppStore((state) => state.evaluations);
  const storeRecoveries = useAppStore((state) => state.skillRecoveryActions);
  const storeAttendance = useAppStore((state) => state.attendance);

  const [schoolYear, setSchoolYear] = useState<SchoolYear | null>(null);
  const [classes, setClasses] = useState<ArchiveClass[]>([]);
  const [students, setStudents] = useState<ArchiveStudent[]>([]);
  const [evaluationCount, setEvaluationCount] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoData = useMemo(() => {
    if (!yearId) return null;
    const year = storeYears.find((item) => item.id === yearId) ?? null;
    const levelCodeById = new Map(storeLevels.map((level) => [level.id, level.code]));
    const archiveClasses: ArchiveClass[] = storeClasses
      .filter((classe) => classe.schoolYearId === yearId)
      .map((classe) => ({
        id: classe.id,
        name: classe.name,
        levelCode: levelCodeById.get(classe.levelId) ?? "",
        capacity: classe.capacity,
      }));
    const classIds = new Set(archiveClasses.map((classe) => classe.id));
    const enrollments: ArchiveEnrollment[] = storeEnrollments
      .filter((enrollment) => enrollment.schoolYearId === yearId && enrollment.classId)
      .map((enrollment) => ({
        studentId: enrollment.studentId,
        classId: enrollment.classId!,
        status: enrollment.status,
      }));
    const penalties = storeEvaluations
      .filter((evaluation) => classIds.has(evaluation.classId))
      .map<PenaltyLedgerEvent>((evaluation) => ({
        studentId: evaluation.studentId,
        competencyId: evaluation.competencyId,
        date: evaluation.date,
        createdAt: evaluation.createdAt,
      }));
    const recoveries = storeRecoveries.filter((recovery) => classIds.has(recovery.classId));
    const attendance = storeAttendance
      .filter((record) => classIds.has(record.classId))
      .map<ArchiveAttendance>((record) => ({ studentId: record.studentId, status: record.status }));
    return {
      schoolYear: year,
      classes: archiveClasses,
      students: buildArchiveStudents(
        enrollments,
        storeStudents,
        archiveClasses,
        storeCompetencies,
        penalties,
        recoveries,
        attendance,
      ),
      evaluationCount: penalties.length,
      attendanceCount: attendance.length,
    };
  }, [yearId, storeYears, storeClasses, storeLevels, storeEnrollments, storeEvaluations, storeRecoveries, storeAttendance, storeStudents, storeCompetencies]);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !yearId) return;
    setLoading(true);
    setError(null);
    try {
      const [yearResult, classesResult, competenciesResult, enrollmentsResult] = await Promise.all([
        supabase.from("school_years").select("*").eq("id", yearId).maybeSingle(),
        supabase.from("classes").select("id,name,level_id,capacity,levels(code)").eq("school_year_id", yearId).order("name"),
        supabase.from("competencies").select("*").order("order"),
        supabase.from("student_enrollments").select("student_id,class_id,status").eq("school_year_id", yearId),
      ]);
      if (yearResult.error) throw yearResult.error;
      if (!yearResult.data) throw new Error("Année scolaire introuvable.");
      if (!yearResult.data.is_closed) throw new Error("Cette année scolaire n'est pas encore clôturée.");
      if (classesResult.error) throw classesResult.error;
      if (competenciesResult.error) throw competenciesResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;

      const mappedYear: SchoolYear = {
        id: yearResult.data.id,
        name: yearResult.data.name,
        startDate: yearResult.data.start_date,
        endDate: yearResult.data.end_date,
        isActive: yearResult.data.is_active,
        isClosed: yearResult.data.is_closed,
        createdAt: yearResult.data.created_at,
        updatedAt: yearResult.data.updated_at,
      };
      const archiveClasses: ArchiveClass[] = (classesResult.data ?? []).map((classe) => {
        const levelRelation = Array.isArray(classe.levels) ? classe.levels[0] : classe.levels;
        return {
          id: classe.id,
          name: classe.name,
          levelCode: levelRelation?.code ?? "",
          capacity: classe.capacity,
        };
      });
      const competencies: Competency[] = (competenciesResult.data ?? []).map((competency) => ({
        id: competency.id,
        code: competency.code,
        title: competency.title,
        description: competency.description ?? "",
        pedagogicalAdvice: competency.pedagogical_advice ?? "",
        order: competency.order,
        isArchived: competency.is_archived ?? false,
        createdAt: competency.created_at,
      }));
      const enrollments: ArchiveEnrollment[] = (enrollmentsResult.data ?? [])
        .filter((enrollment) => Boolean(enrollment.class_id))
        .map((enrollment) => ({
          studentId: enrollment.student_id,
          classId: enrollment.class_id!,
          status: enrollment.status as EnrollmentStatus,
        }));
      const classIds = archiveClasses.map((classe) => classe.id);
      const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.studentId))];
      const safeClassIds = classIds.length > 0 ? classIds : ["00000000-0000-0000-0000-000000000000"];
      const safeStudentIds = studentIds.length > 0 ? studentIds : ["00000000-0000-0000-0000-000000000000"];

      const [studentsResult, evaluationsResult, recoveriesResult, attendanceResult] = await Promise.all([
        supabase.from("students").select("*").in("id", safeStudentIds),
        supabase.from("evaluations").select("student_id,competency_id,date,created_at").in("class_id", safeClassIds),
        supabase.from("skill_recovery_actions").select("*").in("class_id", safeClassIds),
        supabase.from("attendance").select("student_id,status").in("class_id", safeClassIds),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (evaluationsResult.error) throw evaluationsResult.error;
      if (recoveriesResult.error && !isMissingSkillRecoveryTable(recoveriesResult.error)) throw recoveriesResult.error;
      if (attendanceResult.error) throw attendanceResult.error;

      const mappedStudents: Student[] = (studentsResult.data ?? []).map((student) => ({
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        birthDate: student.birth_date ?? "",
        gender: (student.gender ?? "M") as "M" | "F",
        classId: student.class_id ?? "",
        photoUrl: student.photo_url ?? undefined,
        createdAt: student.created_at,
      }));
      const penalties: PenaltyLedgerEvent[] = (evaluationsResult.data ?? []).map((evaluation) => ({
        studentId: evaluation.student_id,
        competencyId: evaluation.competency_id,
        date: evaluation.date,
        createdAt: evaluation.created_at,
      }));
      const recoveries: SkillRecoveryAction[] = recoveriesResult.error ? [] : (recoveriesResult.data ?? []).map((recovery) => ({
        id: recovery.id,
        studentId: recovery.student_id,
        competencyId: recovery.competency_id,
        classId: recovery.class_id,
        actionType: recovery.action_type as "increase" | "reset_to_100",
        previousScore: recovery.previous_score,
        newScore: recovery.new_score,
        meetingDate: recovery.meeting_date,
        studentReason: recovery.student_reason,
        meetingNotes: recovery.meeting_notes,
        createdBy: recovery.created_by,
        createdAt: recovery.created_at,
      }));
      const attendance: ArchiveAttendance[] = (attendanceResult.data ?? []).map((record) => ({
        studentId: record.student_id,
        status: record.status as "present" | "absent",
      }));

      setSchoolYear(mappedYear);
      setClasses(archiveClasses);
      setStudents(buildArchiveStudents(enrollments, mappedStudents, archiveClasses, competencies, penalties, recoveries, attendance));
      setEvaluationCount(penalties.length);
      setAttendanceCount(attendance.length);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger l'archive scolaire.");
      setSchoolYear(null);
      setClasses([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [yearId]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  return {
    schoolYear: isDemo ? demoData?.schoolYear ?? null : schoolYear,
    classes: isDemo ? demoData?.classes ?? [] : classes,
    students: isDemo ? demoData?.students ?? [] : students,
    evaluationCount: isDemo ? demoData?.evaluationCount ?? 0 : evaluationCount,
    attendanceCount: isDemo ? demoData?.attendanceCount ?? 0 : attendanceCount,
    loading: isDemo ? false : loading,
    error: isDemo
      ? demoData?.schoolYear?.isClosed ? null : "Cette année scolaire n'est pas clôturée."
      : error,
    refetch: fetchFromSupabase,
  };
}
