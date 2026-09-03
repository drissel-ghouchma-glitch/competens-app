import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SchoolYear, Level, Classe, Student, Teacher,
  Competency, Evaluation, EvaluationStatus,
  Alert, Notification, TeacherClassAssignment, DailyEvaluationInput,
  AttendanceRecord, DailyAttendanceInput, AttendanceStatus, AttendancePeriod,
  SkillRecoveryAction, SkillRecoveryRequest, SchoolYearClosureDecisionInput, SchoolYearClosureResult, StudentEnrollment, EnrollmentStatus,
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
  skillRecoveryActions: SkillRecoveryAction[];
  skillRecoveryRequests: SkillRecoveryRequest[];
  alerts: Alert[];
  notifications: Notification[];
  teacherClassAssignments: TeacherClassAssignment[];
  attendance: AttendanceRecord[];
  studentEnrollments: StudentEnrollment[];
  celebrationPublished: boolean;

  initDemoData: () => void;
  setCelebrationPublished: (value: boolean) => void;

  addSchoolYear: (sy: Omit<SchoolYear, "id" | "createdAt" | "updatedAt">) => void;
  updateSchoolYear: (id: string, data: Partial<SchoolYear>) => void;
  toggleSchoolYearActive: (id: string) => void;
  prepareDemoSchoolYearClosure: (sourceYearId: string, targetYearId: string) => Classe[];
  finalizeSchoolYearClosure: (
    sourceYearId: string,
    targetYearId: string,
    decisions: SchoolYearClosureDecisionInput[],
  ) => SchoolYearClosureResult;

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
  deleteCompetency: (id: string) => void;

  saveDailyEvaluation: (classId: string, competencyId: string, evaluations: DailyEvaluationInput[]) => void;
  addDemoSkillRecoveryAction: (action: Omit<SkillRecoveryAction, "id" | "createdAt">) => void;
  addDemoSkillRecoveryRequest: (request: Omit<SkillRecoveryRequest, "id" | "createdAt" | "status">) => void;
  resolveDemoSkillRecoveryRequest: (studentId: string, competencyId: string, classId: string, reviewedBy: string) => void;
  saveDemoAttendance: (classId: string, date: string, period: AttendancePeriod, inputs: DailyAttendanceInput[], teacherId: string) => void;
  confirmDemoAttendance: (classId: string, date: string, period: AttendancePeriod) => void;
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
      skillRecoveryActions: [],
      skillRecoveryRequests: [],
      alerts: [],
      notifications: [],
      teacherClassAssignments: [],
      attendance: [],
      studentEnrollments: [],
      celebrationPublished: false,

      setCelebrationPublished(value) {
        set({ celebrationPublished: value });
      },

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
      prepareDemoSchoolYearClosure(sourceYearId, targetYearId) {
        let targetClasses: Classe[] = [];
        set((s) => {
          const existing = s.classes.filter((classe) => classe.schoolYearId === targetYearId);
          const existingKeys = new Set(existing.map((classe) => `${classe.name.toLowerCase()}|${classe.levelId}`));
          const clones = s.classes
            .filter((classe) => classe.schoolYearId === sourceYearId && !classe.isArchived)
            .filter((classe) => !existingKeys.has(`${classe.name.toLowerCase()}|${classe.levelId}`))
            .map<Classe>((classe) => ({
              ...classe,
              id: generateUUID(),
              schoolYearId: targetYearId,
              teacherId: undefined,
              teacher: undefined,
              studentCount: 0,
              createdAt: new Date().toISOString(),
            }));
          targetClasses = [...existing, ...clones];
          const sourceYear = s.schoolYears.find((year) => year.id === sourceYearId);
          const sourceClassIds = new Set(s.classes.filter((classe) => classe.schoolYearId === sourceYearId).map((classe) => classe.id));
          const enrolledKeys = new Set(s.studentEnrollments.map((enrollment) => `${enrollment.studentId}|${enrollment.schoolYearId}`));
          const now = new Date().toISOString();
          const snapshots: StudentEnrollment[] = s.students
            .filter((student) => sourceClassIds.has(student.classId))
            .filter((student) => !enrolledKeys.has(`${student.id}|${sourceYearId}`))
            .map((student) => ({
              id: generateUUID(), studentId: student.id, schoolYearId: sourceYearId,
              classId: student.classId, status: "active", startedAt: sourceYear?.startDate ?? now.split("T")[0],
              createdAt: now, updatedAt: now,
            }));
          return {
            classes: clones.length > 0 ? [...s.classes, ...clones] : s.classes,
            studentEnrollments: [...s.studentEnrollments, ...snapshots],
          };
        });
        return targetClasses;
      },
      finalizeSchoolYearClosure(sourceYearId, targetYearId, decisions) {
        const result: SchoolYearClosureResult = {
          total: decisions.length,
          promoted: decisions.filter((d) => d.decision === "promote").length,
          repeated: decisions.filter((d) => d.decision === "repeat").length,
          graduated: decisions.filter((d) => d.decision === "graduate").length,
          transferred: decisions.filter((d) => d.decision === "transfer").length,
          withdrawn: decisions.filter((d) => d.decision === "withdraw").length,
        };
        const decisionByStudent = new Map(decisions.map((decision) => [decision.studentId, decision]));
        set((s) => {
          const students = s.students.map((student) => {
            const decision = decisionByStudent.get(student.id);
            if (!decision) return student;
            return {
              ...student,
              classId: decision.decision === "promote" || decision.decision === "repeat"
                ? decision.targetClassId ?? ""
                : "",
            };
          });
          const classes = s.classes.map((classe) => ({
            ...classe,
            studentCount: classe.schoolYearId === targetYearId
              ? students.filter((student) => student.classId === classe.id).length
              : classe.studentCount,
          }));
          const now = new Date().toISOString();
          const sourceYear = s.schoolYears.find((year) => year.id === sourceYearId);
          const targetYear = s.schoolYears.find((year) => year.id === targetYearId);
          const sourceEnrollments = s.studentEnrollments.map((enrollment) => {
            const decision = decisionByStudent.get(enrollment.studentId);
            if (enrollment.schoolYearId !== sourceYearId || !decision) return enrollment;
            const statusByDecision: Record<string, EnrollmentStatus> = {
              promote: "promoted", repeat: "repeated", graduate: "graduated",
              transfer: "transferred", withdraw: "withdrawn",
            };
            return {
              ...enrollment,
              status: statusByDecision[decision.decision] ?? enrollment.status,
              endedAt: sourceYear?.endDate,
              updatedAt: now,
            };
          });
          const enrollmentKeys = new Set(sourceEnrollments.map((enrollment) => `${enrollment.studentId}|${enrollment.schoolYearId}`));
          const targetEnrollments: StudentEnrollment[] = decisions
            .filter((decision) => decision.decision === "promote" || decision.decision === "repeat")
            .filter((decision) => !enrollmentKeys.has(`${decision.studentId}|${targetYearId}`))
            .map((decision) => ({
              id: generateUUID(), studentId: decision.studentId, schoolYearId: targetYearId,
              classId: decision.targetClassId, status: "active",
              startedAt: targetYear?.startDate ?? now.split("T")[0], createdAt: now, updatedAt: now,
            }));
          const schoolYears = s.schoolYears.map((year) => ({
            ...year,
            isClosed: year.id === sourceYearId ? true : year.isClosed,
            isActive: year.id === targetYearId,
            updatedAt: year.id === sourceYearId || year.id === targetYearId ? now : year.updatedAt,
          }));
          return { students, classes, schoolYears, studentEnrollments: [...sourceEnrollments, ...targetEnrollments] };
        });
        return result;
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
      deleteCompetency(id) {
        set((s) => ({
          competencies: s.competencies.filter((c) => c.id !== id),
          evaluations: s.evaluations.filter((e) => e.competencyId !== id),
        }));
      },

      saveDailyEvaluation(classId, competencyId, evals) {
        const now = new Date().toISOString();
        const today = now.split("T")[0];
        set((s) => {
          const teacherId = s.classes.find((c) => c.id === classId)?.teacherId ?? "";
          // Only insert penalty rows for students not already locked today for this teacher
          const alreadyLocked = new Set(
            s.evaluations
              .filter((e) => e.competencyId === competencyId && e.date === today && e.teacherId === teacherId)
              .map((e) => e.studentId)
          );
          const newEvals: Evaluation[] = evals
            .filter((ev) => !alreadyLocked.has(ev.studentId))
            .map((ev) => ({
              id: generateUUID(),
              studentId: ev.studentId,
              competencyId,
              teacherId,
              classId,
              date: today,
              createdAt: now,
            }));
          return { evaluations: [...s.evaluations, ...newEvals] };
        });
      },
      addDemoSkillRecoveryAction(action) {
        set((s) => ({
          skillRecoveryActions: [
            ...s.skillRecoveryActions,
            { ...action, id: generateUUID(), createdAt: new Date().toISOString() },
          ],
        }));
      },
      addDemoSkillRecoveryRequest(request) {
        set((s) => {
          const alreadyPending = s.skillRecoveryRequests.some((item) =>
            item.status === "pending" && item.studentId === request.studentId && item.competencyId === request.competencyId && item.classId === request.classId
          );
          if (alreadyPending) return s;
          return {
            skillRecoveryRequests: [
              ...s.skillRecoveryRequests,
              { ...request, id: generateUUID(), status: "pending", createdAt: new Date().toISOString() },
            ],
          };
        });
      },
      resolveDemoSkillRecoveryRequest(studentId, competencyId, classId, reviewedBy) {
        set((s) => {
          const request = s.skillRecoveryRequests
            .filter((item) => item.status === "pending" && item.studentId === studentId && item.competencyId === competencyId && item.classId === classId)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
          if (!request) return s;
          return {
            skillRecoveryRequests: s.skillRecoveryRequests.map((item) => item.id === request.id
              ? { ...item, status: "completed", reviewedBy, reviewedAt: new Date().toISOString() }
              : item),
          };
        });
      },
      saveDemoAttendance(classId, date, period, inputs, teacherId) {
        if (get().attendance.some(
          (record) => record.classId === classId && record.date === date && record.period === period
        )) {
          throw new Error("ATTENDANCE_REGISTER_LOCKED");
        }
        set((s) => {
          const next = s.attendance.filter(
            (a) => !(a.classId === classId && a.date === date && a.period === period && inputs.some((i) => i.studentId === a.studentId))
          );
          const newRecords: AttendanceRecord[] = inputs.map((i) => ({
            id: generateUUID(),
            studentId: i.studentId,
            classId,
            teacherId,
            date,
            period,
            status: i.status as AttendanceStatus,
            isConfirmedByAdmin: false,
            createdAt: new Date().toISOString(),
          }));
          return { attendance: [...next, ...newRecords] };
        });
      },
      confirmDemoAttendance(classId, date, period) {
        set((s) => ({
          attendance: s.attendance.map((a) =>
            a.classId === classId && a.date === date && a.period === period
              ? { ...a, isConfirmedByAdmin: true }
              : a
          ),
        }));
      },
      markAlertResolved(id) {
        set((s) => ({ alerts: s.alerts.map((a) => a.id === id ? { ...a, resolved: true, resolvedAt: new Date().toISOString() } : a) }));
      },
      markNotificationRead(id) {
        set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) }));
      },

      getStudentStats(studentId) {
        const { evaluations, competencies, skillRecoveryActions } = get();
        const studentPenalties = evaluations.filter((e) => e.studentId === studentId);
        return competencies.map((comp) => {
          const cp = studentPenalties.filter((e) => e.competencyId === comp.id);
          const recoveries = skillRecoveryActions.filter(
            (action) => action.studentId === studentId && action.competencyId === comp.id
          );
          const ledger = [
            ...cp.map((event) => ({ date: event.date, createdAt: event.createdAt, type: "penalty" as const })),
            ...recoveries.map((action) => ({ date: action.meetingDate, createdAt: action.createdAt, type: action.actionType, newScore: action.newScore })),
          ].sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt));
          const rate = ledger.reduce((score, event) => event.type === "penalty"
            ? Math.max(0, score - 1)
            : event.newScore ?? score, 100);
          const lastStatus: EvaluationStatus = rate >= 90 ? "acquis" : rate > 50 ? "en_cours" : "non_acquis";
          return { competencyId: comp.id, competencyCode: comp.code, competencyTitle: comp.title, acquisitionRate: rate, totalEvaluations: cp.length, lastStatus };
        });
      },
    }),
    { name: "competens-store", version: 1 }
  )
);
