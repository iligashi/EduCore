import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { CmsPage } from "./pages/CmsPage";
import { CoursesPage } from "./pages/CoursesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InstructorsPage } from "./pages/InstructorsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SearchPage } from "./pages/SearchPage";
import { StudentsPage } from "./pages/StudentsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="instructors" element={<InstructorsPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="cms" element={<CmsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="search" element={<SearchPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

