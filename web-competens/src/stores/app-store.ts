import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SchoolYear, Level, Classe, Student, Teacher,
  Competency, Evaluation, EvaluationStatus,
  Alert, Notification, TeacherClassAssignment, DailyEvaluationInput,
} from "@/types";
import { generateDemoData } from "./seed-data";

// دالة مساعدة لتوليد معرفات متوافقة مع صيغة UUID الخاصة بـ Supabase في جميع المتصفحات والبيئات
const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // نظام بديل آمن (Fallback) لتوليد صيغة UUID v4 القياسية
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface AppStore {
  initialized: boolean;
  schoolYears: SchoolYear[];
  levels: Level[];
  classes: Classe[];
  students: Student[];
  teachers: Teacher[];
  competencies: Competency[];
  evaluations: Evaluation[];
  alerts: Alert[];
  notifications: Notification[];
  teacherClassAssignments: TeacherClassAssignment[];

  initDemoData: () => void;

  addSchoolYear: (sy: Omit<SchoolYear, "id" | "createdAt" | "updatedAt">) => void;
  updateSchoolYear: (id: string, data: Partial<SchoolYear>) => void;
  toggleSchoolYearActive: (id: string) => void;
  closeSchoolYear: (id: string) => void;

  addLevel: (level: Omit<Level, "id" | "createdAt">) => void;
  updateLevel: (id: string, data: Partial<Level>) => void;
  archiveLevel: (id: string) => void;

  addClass: (cls: Omit<Classe, "id" | "createdAt" | "studentCount">) => void;
  updateClass: (id: string, data: Partial<Classe>) => void;
  archiveClass: (id: string) => void;
  deleteClass: (id: string) => void;

  addStudent: (s: Omit<Student, "id" | "createdAt">) => void;
  updateStudent: (id: string, data: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  importStudents: (rows: Array<{ firstName: string; lastName: string; birthDate: string; gender: "M" | "F"; classId: string }>) => void;

  addTeacher: (t: Omit<Teacher, "id" | "createdAt">) => void;
  updateTeacher: (id: string, data: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
  assignTeacherToClass: (teacherId: string, classId: string) => void;
  unassignTeacherFromClass: (teacherId: string, classId: string) => void;

  addCompetency: (c: Omit<Competency, "id" | "createdAt">) => void;
  updateCompetency: (id: string, data: Partial<Competency>) => void;

  saveDailyEvaluation: (classId: string, competencyId: string, evaluations: DailyEvaluationInput[]) => void;
  markAlertResolved: (id: string) => void;
  markNotificationRead: (id: string) => void;

  getStudentStats: (studentId: string) => Array<{
    competencyId: string; competencyCode: string; competencyTitle: string;
    acquisitionRate: number; totalEvaluations: number; lastStatus: EvaluationStatus;
  }>;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      initialized: false,
      schoolYears: [],
      levels: [],
      classes: [],
      students: [],
      teachers: [],
      competencies: [],
      evaluations: [],
      alerts: [],
      notifications: [],
      teacherClassAssignments: [],

      initDemoData() {
        if (get().initialized) return;
        const data = generateDemoData();
        set({ ...data, initialized: true });
      },

      addSchoolYear(sy) {
        set((s) => ({ schoolYears: [...s.schoolYears, { ...sy, id: generateUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }));
      },
      updateSchoolYear(id, data) {
        set((s) => ({ schoolYears: s.schoolYears.map((y) => y.id === id ? { ...y, ...data, updatedAt: new Date().toISOString() } : y) }));
      },
      toggleSchoolYearActive(id) {
        set((s) => ({ schoolYears: s.schoolYears.map((y) => y.id === id ? { ...y, isActive: !y.isActive } : { ...y, isActive: false }) }));
      },
      closeSchoolYear(id) {
        set((s) => ({ schoolYears: s.schoolYears.map((y) => y.id === id ? { ...y, isClosed: true, isActive: false } : y) }));
      },

      addLevel(level) {
        set((s) => ({ levels: [...s.levels, { ...level, id: generateUUID(), createdAt: new Date().toISOString() }] }));
      },
      updateLevel(id, data) {
        set((s) => ({ levels: s.levels.map((l) => l.id === id ? { ...l, ...data } : l) }));
      },
      archiveLevel(id) {
        set((s) => ({ levels: s.levels.map((l) => l.id === id ? { ...l, isArchived: !l.isArchived } : l) }));
      },

      addClass(cls) {
        const newClass: Classe = { ...cls, id: generateUUID(), studentCount: 0, createdAt: new Date().toISOString() };
        set((s) => ({ classes: [...s.classes, newClass] }));
      },
      updateClass(id, data) {
        set((s) => ({ classes: s.classes.map((c) => c.id === id ? { ...c, ...data } : c) }));
      },
      archiveClass(id) {
        set((s) => ({ classes: s.classes.map((c) => c.id === id ? { ...c, isArchived: !c.isArchived } : c) }));
      },
      deleteClass(id) {
        set((s) => ({ classes: s.classes.filter((c) => c.id !== id), students: s.students.map((st) => st.classId === id ? { ...st, classId: "" } : st) }));
      },

      addStudent(st) {
        const ns: Student = { ...st, id: generateUUID(), createdAt: new Date().toISOString() };
        set((s) => {
          const classes = s.classes.map((c) => c.id === st.classId ? { ...c, studentCount: c.studentCount + 1 } : c);
          return { students: [...s.students, ns], classes };
        });
      },
      updateStudent(id, data) {
        set((s) => {
          const old = s.students.find((st) => st.id === id);
          const students = s.students.map((st) => st.id === id ? { ...st, ...data } : st);
          let classes = s.classes;
          if (old && data.classId && old.classId !== data.classId) {
            classes = classes.map((c) => {
              if (c.id === old.classId) return { ...c, studentCount: Math.max(0, c.studentCount - 1) };
              if (c.id === data.classId) return { ...c, studentCount: c.studentCount + 1 };
              return c;
            });
          }
          return { students, classes };
        });
      },
      deleteStudent(id) {
        set((s) => {
          const st = s.students.find((x) => x.id === id);
          const classes = st ? s.classes.map((c) => c.id === st.classId ? { ...c, studentCount: Math.max(0, c.studentCount - 1) } : c) : s.classes;
          return { students: s.students.filter((x) => x.id !== id), classes };
        });
      },
      importStudents(rows) {
        const newStudents: Student[] = rows.map((r) => ({ ...r, id: generateUUID(), createdAt: new Date().toISOString() }));
        set((s) => {
          const classCounts: Record<string, number> = {};
          for (const r of rows) { classCounts[r.classId] = (classCounts[r.classId] ?? 0) + 1; }
          const classes = s.classes.map((c) => ({ ...c, studentCount: c.studentCount + (classCounts[c.id] ?? 0) }));
          return { students: [...s.students, ...newStudents], classes };
        });
      },

      addTeacher(t) {
        set((s) => ({ teachers: [...s.teachers, { ...t, id: generateUUID(), createdAt: new Date().toISOString() }] }));
      },
      updateTeacher(id, data) {
        set((s) => ({ teachers: s.teachers.map((t) => t.id === id ? { ...t, ...data } : t) }));
      },
      deleteTeacher(id) {
        set((s) => ({ teachers: s.teachers.filter((t) => t.id !== id), teacherClassAssignments: s.teacherClassAssignments.filter((a) => a.teacherId !== id) }));
      },
      assignTeacherToClass(teacherId, classId) {
        set((s) => ({
          teacherClassAssignments: [...s.teacherClassAssignments, { id: generateUUID(), teacherId, classId }],
          classes: s.classes.map((c) => c.id === classId ? { ...c, teacherId } : c),
        }));
      },
      unassignTeacherFromClass(teacherId, classId) {
        set((s) => ({
          teacherClassAssignments: s.teacherClassAssignments.filter((a) => !(a.teacherId === teacherId && a.classId === classId)),
          classes: s.classes.map((c) => c.id === classId ? { ...c, teacherId: undefined } : c),
        }));
      },

      addCompetency(c) {
        set((s) => ({ competencies: [...s.competencies, { ...c, id: generateUUID(), createdAt: new Date().toISOString() }] }));
      },
      updateCompetency(id, data) {
        set((s) => ({ competencies: s.competencies.map((c) => c.id === id ? { ...c, ...data } : c) }));
      },

      saveDailyEvaluation(classId, competencyId, evals) {
        const now = new Date().toISOString();
        const today = now.split("T")[0];
        set((s) => {
          const existing = s.evaluations.filter(
            (e) => e.classId === classId && e.competencyId === competencyId && e.date === today
          );
          const existingIds = new Set(existing.map((e) => e.studentId));
          const teacherId = s.classes.find((c) => c.id === classId)?.teacherId ?? "";
          const newEvals: Evaluation[] = evals
            .filter((ev) => !existingIds.has(ev.studentId))
            .map((ev) => ({
              id: generateUUID(),
              studentId: ev.studentId,
              competencyId,
              teacherId,
              classId,
              status: ev.status,
              date: today,
              createdAt: now,
            }));
          const updated = s.evaluations.map((e) => {
            const match = evals.find((ev) => ev.studentId === e.studentId && e.date === today && e.competencyId === competencyId);
            return match ? { ...e, status: match.status } : e;
          });
          return { evaluations: [...updated, ...newEvals] };
        });
      },
      markAlertResolved(id) {
        set((s) => ({ alerts: s.alerts.map((a) => a.id === id ? { ...a, resolved: true, resolvedAt: new Date().toISOString() } : a) }));
      },
      markNotificationRead(id) {
        set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) }));
      },

      getStudentStats(studentId) {
        const { evaluations, competencies } = get();
        const studentEvals = evaluations.filter((e) => e.studentId === studentId);
        return competencies.map((comp) => {
          const compEvals = studentEvals.filter((e) => e.competencyId === comp.id);
          const total = compEvals.length;
          const acquired = compEvals.filter((e) => e.status === "acquis").length;
          const last = compEvals.length > 0 ? compEvals[compEvals.length - 1].status : "non_acquis";
          return {
            competencyId: comp.id,
            competencyCode: comp.code,
            competencyTitle: comp.title,
            acquisitionRate: total > 0 ? Math.round((acquired / total) * 100) : 0,
            totalEvaluations: total,
            lastStatus: last,
          };
        });
      },
    }),
    { name: "competens-store", version: 1 }
  )
);