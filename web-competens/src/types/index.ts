export type Role = "admin" | "directeur" | "professeur" | "parent";
export type UserStatus = "active" | "pending" | "suspended";

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface SchoolYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Level {
  id: string;
  name: string;
  code: string;
  isArchived: boolean;
  createdAt: string;
}

export interface Classe {
  id: string;
  name: string;
  levelId: string;
  level?: Level;
  teacherId?: string;
  teacher?: Teacher;
  capacity: number;
  studentCount: number;
  isArchived: boolean;
  schoolYearId: string;
  createdAt: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "M" | "F";
  classId: string;
  classe?: Classe;
  photoUrl?: string;
  createdAt: string;
}

export interface Teacher {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  createdAt: string;
}

export interface TeacherClassAssignment {
  id: string;
  teacherId: string;
  classId: string;
}

export interface Competency {
  id: string;
  code: string;
  title: string;
  description: string;
  pedagogicalAdvice: string;
  order: number;
  isArchived: boolean;
  createdAt: string;
}

// Display-only type — used for chart category mapping.
// No longer stored in the DB; derived from globalScore via scoreToStatus().
export type EvaluationStatus = "acquis" | "en_cours" | "non_acquis";

// A row in the evaluations table now represents a single -1 penalty event.
// Global score for a student / competency = 100 - COUNT(rows).
export interface Evaluation {
  id: string;
  studentId: string;
  competencyId: string;
  teacherId: string;
  classId: string;
  date: string;
  createdAt: string;
}

export interface EvaluationWithDetails extends Evaluation {
  student?: Student;
  competency?: Competency;
  teacher?: Teacher;
}

// Per-student info returned by the evaluation hook for the teacher grid.
export interface StudentEvalInfo {
  score: number;        // 100 - total penalty count (all-time, all teachers)
  lockedByMe: boolean;  // current teacher already saved today for this student+competency
}

export interface Alert {
  id: string;
  studentId: string;
  student?: Student;
  level: "warning" | "critical";
  cause: string;
  date: string;
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: "alert" | "info" | "evaluation";
  relatedId?: string;
  createdAt: string;
}

// Payload for inserting a penalty event: teacher selects which students to penalize.
export interface DailyEvaluationInput {
  studentId: string;
  competencyId: string;
}

export interface StudentStats {
  studentId: string;
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  acquisitionRate: number;
  totalEvaluations: number;
  lastStatus: EvaluationStatus;
}

export interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  totalEvaluations: number;
  weeklyActivity: { date: string; count: number }[];
  recentAlerts: Alert[];
}

export interface ParentStudentLink {
  id: string;
  parentId: string;
  studentId: string;
  createdAt: string;
}

export type AttendanceStatus = "present" | "absent";
export type AttendancePeriod = "morning" | "afternoon";

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  date: string; // YYYY-MM-DD
  period: AttendancePeriod;
  status: AttendanceStatus;
  isConfirmedByAdmin: boolean;
  createdAt: string;
}

export interface DailyAttendanceInput {
  studentId: string;
  status: AttendanceStatus;
}

export interface ImportRow {
  Nom: string;
  Prénom: string;
  "Date de naissance": string;
  Sexe: string;
  Classe: string;
}
