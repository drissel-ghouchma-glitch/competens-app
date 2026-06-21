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
  createdAt: string;
}

export type EvaluationStatus = "acquis" | "en_cours" | "non_acquis";

export interface Evaluation {
  id: string;
  studentId: string;
  competencyId: string;
  teacherId: string;
  classId: string;
  status: EvaluationStatus;
  date: string;
  createdAt: string;
}

export interface EvaluationWithDetails extends Evaluation {
  student?: Student;
  competency?: Competency;
  teacher?: Teacher;
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

export interface DailyEvaluationInput {
  studentId: string;
  competencyId: string;
  status: EvaluationStatus;
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

export interface ImportRow {
  Nom: string;
  Prénom: string;
  "Date de naissance": string;
  Sexe: string;
  Classe: string;
}
