import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/i18n";
import { OfflineSyncProvider } from "@/lib/offline-sync";
import AppLayout from "@/components/layout/AppLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import SchoolYears from "./pages/SchoolYears";
import SchoolYearArchive from "./pages/SchoolYearArchive";
import Levels from "./pages/Levels";
import Classes from "./pages/Classes";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Teachers from "./pages/Teachers";
import Competencies from "./pages/Competencies";
import Evaluation from "./pages/Evaluation";
import Alerts from "./pages/Alerts";
import Attendance from "./pages/Attendance";
import PendingTeachers from "./pages/admin/PendingTeachers";
import AdminRequests from "./pages/admin/AdminRequests";
import UserManagement from "./pages/admin/UserManagement";
import TeacherEvaluationAnalysis from "./pages/admin/TeacherEvaluationAnalysis";
import ParentDashboard from "./pages/parent/ParentDashboard";
import PrincipalClasses from "./pages/PrincipalClasses";
import TeacherGuide from "./pages/TeacherGuide";
import AdminGuide from "./pages/AdminGuide";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function AppInner() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/school-years" element={<SchoolYears />} />
          <Route path="/school-years/:yearId/archive" element={<SchoolYearArchive />} />
          <Route path="/levels" element={<Levels />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentDetail />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/competencies" element={<Competencies />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/principal-classes" element={<PrincipalClasses />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/teacher-guide" element={<TeacherGuide />} />
          <Route path="/admin-guide" element={<AdminGuide />} />
          <Route path="/admin/pending-teachers" element={<PendingTeachers />} />
          <Route path="/admin/requests" element={<AdminRequests />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/evaluation-analysis" element={<TeacherEvaluationAnalysis />} />
          <Route path="/parent" element={<ParentDashboard />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <OfflineSyncProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner richColors position="top-right" />
            <AppInner />
          </TooltipProvider>
        </OfflineSyncProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
