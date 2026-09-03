import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";

export interface ReportTeacher {
  id: string;
  fullName: string;
}

export interface ReportClass {
  id: string;
  name: string;
  teacherId?: string;
}

export interface ReportStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
}

export interface ReportCompetency {
  id: string;
  code: string;
  title: string;
  order: number;
}

export interface ReportEvaluation {
  studentId: string;
  competencyId: string;
  teacherId: string;
  classId: string;
}

export interface TeacherEvaluationReportData {
  teachers: ReportTeacher[];
  classes: ReportClass[];
  assignments: Array<{ teacherId: string; classId: string }>;
  students: ReportStudent[];
  competencies: ReportCompetency[];
  evaluations: ReportEvaluation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTeacherEvaluationReport(): TeacherEvaluationReportData {
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const demoYears = useAppStore((state) => state.schoolYears);
  const demoTeachers = useAppStore((state) => state.teachers);
  const demoClasses = useAppStore((state) => state.classes);
  const demoAssignments = useAppStore((state) => state.teacherClassAssignments);
  const demoStudents = useAppStore((state) => state.students);
  const demoCompetencies = useAppStore((state) => state.competencies);
  const demoEvaluations = useAppStore((state) => state.evaluations);

  const [data, setData] = useState<Omit<TeacherEvaluationReportData, "loading" | "error" | "refetch">>({
    teachers: [], classes: [], assignments: [], students: [], competencies: [], evaluations: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoData = useMemo(() => {
    const activeYearId = demoYears.find((year) => year.isActive && !year.isClosed)?.id;
    const classes = demoClasses
      .filter((classe) => !classe.isArchived && classe.schoolYearId === activeYearId)
      .map((classe) => ({ id: classe.id, name: classe.name, teacherId: classe.teacherId }));
    const classIds = new Set(classes.map((classe) => classe.id));
    return {
      teachers: demoTeachers.map((teacher) => ({ id: teacher.id, fullName: `${teacher.firstName} ${teacher.lastName}`.trim() })),
      classes,
      assignments: demoAssignments
        .filter((assignment) => classIds.has(assignment.classId))
        .map((assignment) => ({ teacherId: assignment.teacherId, classId: assignment.classId })),
      students: demoStudents
        .filter((student) => classIds.has(student.classId))
        .map((student) => ({ id: student.id, firstName: student.firstName, lastName: student.lastName, classId: student.classId })),
      competencies: demoCompetencies
        .filter((competency) => !competency.isArchived)
        .map((competency) => ({ id: competency.id, code: competency.code, title: competency.title, order: competency.order })),
      evaluations: demoEvaluations
        .filter((evaluation) => classIds.has(evaluation.classId))
        .map((evaluation) => ({
          studentId: evaluation.studentId,
          competencyId: evaluation.competencyId,
          teacherId: evaluation.teacherId,
          classId: evaluation.classId,
        })),
    };
  }, [demoAssignments, demoClasses, demoCompetencies, demoEvaluations, demoStudents, demoTeachers, demoYears]);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: activeYear, error: activeYearError } = await supabase
        .from("school_years")
        .select("id")
        .eq("is_active", true)
        .eq("is_closed", false)
        .maybeSingle();
      if (activeYearError) throw activeYearError;
      if (!activeYear) {
        setData({ teachers: [], classes: [], assignments: [], students: [], competencies: [], evaluations: [] });
        return;
      }

      const [teachersResult, classesResult, competenciesResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name").eq("role", "professeur").eq("status", "active").order("full_name"),
        supabase.from("classes").select("id,name,teacher_id").eq("school_year_id", activeYear.id).eq("is_archived", false).order("name"),
        supabase.from("competencies").select("id,code,title,order").eq("is_archived", false).order("order"),
      ]);
      if (teachersResult.error) throw teachersResult.error;
      if (classesResult.error) throw classesResult.error;
      if (competenciesResult.error) throw competenciesResult.error;

      const classes: ReportClass[] = (classesResult.data ?? []).map((classe) => ({
        id: classe.id, name: classe.name, teacherId: classe.teacher_id ?? undefined,
      }));
      const classIds = classes.map((classe) => classe.id);
      if (classIds.length === 0) {
        setData({
          teachers: (teachersResult.data ?? []).map((teacher) => ({ id: teacher.id, fullName: teacher.full_name ?? "" })),
          classes: [], assignments: [], students: [],
          competencies: (competenciesResult.data ?? []).map((competency) => ({ id: competency.id, code: competency.code, title: competency.title, order: competency.order })),
          evaluations: [],
        });
        return;
      }

      const [assignmentsResult, studentsResult, evaluationsResult] = await Promise.all([
        supabase.from("teacher_class_assignments").select("teacher_id,class_id").in("class_id", classIds),
        supabase.from("students").select("id,first_name,last_name,class_id").in("class_id", classIds).eq("is_archived", false).order("last_name"),
        supabase.from("evaluations").select("student_id,competency_id,teacher_id,class_id").in("class_id", classIds),
      ]);
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (studentsResult.error) throw studentsResult.error;
      if (evaluationsResult.error) throw evaluationsResult.error;

      setData({
        teachers: (teachersResult.data ?? []).map((teacher) => ({ id: teacher.id, fullName: teacher.full_name ?? "" })),
        classes,
        assignments: (assignmentsResult.data ?? []).map((assignment) => ({ teacherId: assignment.teacher_id, classId: assignment.class_id })),
        students: (studentsResult.data ?? []).map((student) => ({
          id: student.id, firstName: student.first_name, lastName: student.last_name, classId: student.class_id,
        })),
        competencies: (competenciesResult.data ?? []).map((competency) => ({
          id: competency.id, code: competency.code, title: competency.title, order: competency.order,
        })),
        evaluations: (evaluationsResult.data ?? []).map((evaluation) => ({
          studentId: evaluation.student_id,
          competencyId: evaluation.competency_id,
          teacherId: evaluation.teacher_id ?? "",
          classId: evaluation.class_id ?? "",
        })),
      });
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : "Erreur de chargement du rapport");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo) void fetchFromSupabase();
  }, [fetchFromSupabase, isDemo]);

  return {
    ...(isDemo ? demoData : data),
    loading: isDemo ? false : loading,
    error: isDemo ? null : error,
    refetch: fetchFromSupabase,
  };
}
