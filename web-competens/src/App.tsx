import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/AppLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import SchoolYears from "./pages/SchoolYears";
import Levels from "./pages/Levels";
import Classes from "./pages/Classes";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Teachers from "./pages/Teachers";
import Competencies from "./pages/Competencies";
import Evaluation from "./pages/Evaluation";
import Alerts from "./pages/Alerts";
import PendingTeachers from "./pages/admin/PendingTeachers";
import AdminRequests from "./pages/admin/AdminRequests";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-right" />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/school-years" element={<SchoolYears />} />
              <Route path="/levels" element={<Levels />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/students" element={<Students />} />
              <Route path="/students/:id" element={<StudentDetail />} />
              <Route path="/teachers" element={<Teachers />} />
              <Route path="/competencies" element={<Competencies />} />
              <Route path="/evaluation" element={<Evaluation />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/admin/pending-teachers" element={<PendingTeachers />} />
              <Route path="/admin/requests" element={<AdminRequests />} />
            </Route>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
