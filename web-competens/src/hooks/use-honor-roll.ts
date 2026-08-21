import { useState, useEffect, useCallback, useMemo } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";
import { isMissingSkillRecoveryTable } from "@/lib/skill-recovery";
import { competencyScoreFromLedger, type PenaltyLedgerEvent } from "@/lib/eval-utils";
import { localizeCompTitle } from "@/i18n/competency-content";
import type { Lang } from "@/i18n/translations";
import type { SkillRecoveryAction } from "@/types";

export interface HonorRollStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  average: number;
}

export interface ClassSuccessStat {
  classId: string;
  className: string;
  honoredCount: number;
  totalStudents: number;
  rate: number;
}

export interface TeacherCompetencyBreakdown {
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  count: number;
}

export interface TeacherActivityStat {
  teacherId: string;
  teacherName: string;
  count: number;
  breakdown: TeacherCompetencyBreakdown[];
}

export interface HonorRollClass {
  id: string;
  name: string;
}

interface RawPenalty extends PenaltyLedgerEvent {
  studentId: string;
  competencyId: string;
  teacherId: string | null;
}

interface CompetencyInfo {
  id: string;
  code: string;
  title: string;
  isArchived: boolean;
}

const HONOR_THRESHOLD = 90;

function computeHonorRoll(
  students: { id: string; firstName: string; lastName: string; classId: string }[],
  classes: HonorRollClass[],
  activeCompetencyIds: string[],
  penalties: RawPenalty[],
  recoveries: SkillRecoveryAction[],
): { honorRoll: HonorRollStudent[]; classStats: ClassSuccessStat[] } {
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const allAverages = students.map((s) => {
    const scores = activeCompetencyIds.map((cid) => {
      return competencyScoreFromLedger(penalties, recoveries, s.id, cid);
    });
    const average = scores.length > 0
      ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
      : 0;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      classId: s.classId,
      className: classNameById.get(s.classId) ?? "—",
      average,
    };
  });

  const honorRoll = allAverages
    .filter((s) => s.average >= HONOR_THRESHOLD)
    .sort((a, b) => b.average - a.average);

  const classStats: ClassSuccessStat[] = classes
    .map((c) => {
      const classStudents = allAverages.filter((s) => s.classId === c.id);
      const totalStudents = classStudents.length;
      const honoredCount = classStudents.filter((s) => s.average >= HONOR_THRESHOLD).length;
      const rate = totalStudents > 0 ? Math.round((honoredCount / totalStudents) * 100) : 0;
      return { classId: c.id, className: c.name, honoredCount, totalStudents, rate };
    })
    .filter((c) => c.totalStudents > 0)
    .sort((a, b) => b.rate - a.rate);

  return { honorRoll, classStats };
}

function computeTeacherActivity(
  penalties: RawPenalty[],
  teacherNameById: Map<string, string>,
  competencyById: Map<string, CompetencyInfo>,
  lang: Lang,
): TeacherActivityStat[] {
  const counts = new Map<string, number>();
  const breakdownCounts = new Map<string, Map<string, number>>();
  for (const p of penalties) {
    if (!p.teacherId) continue;
    counts.set(p.teacherId, (counts.get(p.teacherId) ?? 0) + 1);
    if (!breakdownCounts.has(p.teacherId)) breakdownCounts.set(p.teacherId, new Map());
    const compCounts = breakdownCounts.get(p.teacherId)!;
    compCounts.set(p.competencyId, (compCounts.get(p.competencyId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([teacherId, count]) => {
      const compCounts = breakdownCounts.get(teacherId) ?? new Map();
      const breakdown: TeacherCompetencyBreakdown[] = [...compCounts.entries()]
        .map(([competencyId, cnt]) => {
          const comp = competencyById.get(competencyId);
          return {
            competencyId,
            competencyCode: comp?.code ?? "",
            competencyTitle: comp ? localizeCompTitle(comp.code, comp.title, lang) : competencyId,
            count: cnt,
          };
        })
        .sort((a, b) => b.count - a.count);
      return {
        teacherId,
        teacherName: teacherNameById.get(teacherId) ?? teacherId,
        count,
        breakdown,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export interface UseHonorRollReturn {
  classes: HonorRollClass[];
  honorRoll: HonorRollStudent[];
  classStats: ClassSuccessStat[];
  teacherStats: TeacherActivityStat[];
  loading: boolean;
  error: string | null;
}

export function useHonorRoll(lang: Lang = "fr"): UseHonorRollReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // ── Demo selectors ───────────────────────────────────────
  const storeStudents = useAppStore((s) => s.students);
  const storeClasses = useAppStore((s) => s.classes);
  const storeCompetencies = useAppStore((s) => s.competencies);
  const storeEvaluations = useAppStore((s) => s.evaluations);
  const storeRecoveries = useAppStore((s) => s.skillRecoveryActions);
  const storeTeachers = useAppStore((s) => s.teachers);

  const demoClasses = useMemo<HonorRollClass[]>(
    () => storeClasses.filter((c) => !c.isArchived).map((c) => ({ id: c.id, name: c.name })),
    [storeClasses]
  );
  const demoActiveCompetencyIds = useMemo(
    () => storeCompetencies.filter((c) => !c.isArchived).map((c) => c.id),
    [storeCompetencies]
  );
  const demoCompetencyById = useMemo(
    () => new Map(storeCompetencies.map((c) => [c.id, {
      id: c.id, code: c.code, title: c.title, isArchived: c.isArchived ?? false,
    }])),
    [storeCompetencies]
  );
  const demoPenalties = useMemo<RawPenalty[]>(
    () => storeEvaluations.map((e) => ({
      studentId: e.studentId, competencyId: e.competencyId, teacherId: e.teacherId, date: e.date, createdAt: e.createdAt,
    })),
    [storeEvaluations]
  );
  const demoTeacherNameById = useMemo(
    () => new Map(storeTeachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()])),
    [storeTeachers]
  );
  const demoResult = useMemo(
    () => computeHonorRoll(storeStudents, demoClasses, demoActiveCompetencyIds, demoPenalties, storeRecoveries),
    [storeStudents, demoClasses, demoActiveCompetencyIds, demoPenalties, storeRecoveries]
  );
  const demoTeacherStats = useMemo(
    () => computeTeacherActivity(demoPenalties, demoTeacherNameById, demoCompetencyById, lang),
    [demoPenalties, demoTeacherNameById, demoCompetencyById, lang]
  );

  // ── Supabase state ───────────────────────────────────────
  const [sbClasses, setSbClasses] = useState<HonorRollClass[]>([]);
  const [sbHonorRoll, setSbHonorRoll] = useState<HonorRollStudent[]>([]);
  const [sbClassStats, setSbClassStats] = useState<ClassSuccessStat[]>([]);
  const [sbTeacherStats, setSbTeacherStats] = useState<TeacherActivityStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, classesRes, compRes, evalsRes, recoveriesRes, teachersRes] = await Promise.all([
        supabase.from("students").select("id, first_name, last_name, class_id").eq("is_archived", false),
        supabase.from("classes").select("id, name").eq("is_archived", false).order("name"),
        supabase.from("competencies").select("id, code, title, is_archived"),
        supabase.from("evaluations").select("student_id, competency_id, teacher_id, date, created_at"),
        supabase.from("skill_recovery_actions").select("id, student_id, competency_id, class_id, action_type, previous_score, new_score, meeting_date, student_reason, meeting_notes, created_by, created_at"),
        supabase.from("profiles").select("id, full_name").eq("role", "professeur"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (classesRes.error) throw classesRes.error;
      if (compRes.error) throw compRes.error;
      if (evalsRes.error) throw evalsRes.error;
      if (recoveriesRes.error && !isMissingSkillRecoveryTable(recoveriesRes.error)) throw recoveriesRes.error;

      const students = (studentsRes.data ?? []).map((s) => ({
        id: s.id, firstName: s.first_name, lastName: s.last_name, classId: s.class_id ?? "",
      }));
      const classes: HonorRollClass[] = (classesRes.data ?? []).map((c) => ({ id: c.id, name: c.name }));
      const competencies: CompetencyInfo[] = (compRes.data ?? []).map((c) => ({
        id: c.id, code: c.code, title: c.title, isArchived: c.is_archived ?? false,
      }));
      const activeCompetencyIds = competencies.filter((c) => !c.isArchived).map((c) => c.id);
      const competencyById = new Map(competencies.map((c) => [c.id, c]));
      const penalties: RawPenalty[] = (evalsRes.data ?? []).map((e) => ({
        studentId: e.student_id, competencyId: e.competency_id, teacherId: e.teacher_id, date: e.date, createdAt: e.created_at,
      }));
      const recoveries: SkillRecoveryAction[] = recoveriesRes.error ? [] : (recoveriesRes.data ?? []).map((row) => ({
        id: row.id, studentId: row.student_id, competencyId: row.competency_id, classId: row.class_id,
        actionType: row.action_type as "increase" | "reset_to_100", previousScore: row.previous_score, newScore: row.new_score,
        meetingDate: row.meeting_date, studentReason: row.student_reason, meetingNotes: row.meeting_notes,
        createdBy: row.created_by, createdAt: row.created_at,
      }));
      const teacherNameById = new Map(
        (teachersRes.data ?? []).map((t) => [t.id, t.full_name || t.id])
      );

      const { honorRoll, classStats } = computeHonorRoll(students, classes, activeCompetencyIds, penalties, recoveries);
      const teacherStats = computeTeacherActivity(penalties, teacherNameById, competencyById, lang);

      setSbClasses(classes);
      setSbHonorRoll(honorRoll);
      setSbClassStats(classStats);
      setSbTeacherStats(teacherStats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  if (isDemo) {
    return {
      classes: demoClasses,
      honorRoll: demoResult.honorRoll,
      classStats: demoResult.classStats,
      teacherStats: demoTeacherStats,
      loading: false,
      error: null,
    };
  }

  return {
    classes: sbClasses,
    honorRoll: sbHonorRoll,
    classStats: sbClassStats,
    teacherStats: sbTeacherStats,
    loading,
    error,
  };
}
