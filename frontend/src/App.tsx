import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute, RoleRoute } from "./features/auth/ProtectedRoute";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { CmsPage } from "./pages/CmsPage";
import { ClassStudioPage } from "./pages/ClassStudioPage";
import { ContentPage } from "./pages/ContentPage";
import { CopilotPage } from "./pages/CopilotPage";
import { CoursesPage } from "./pages/CoursesPage";
import { HomePage } from "./pages/HomePage";
import { InstructorsPage } from "./pages/InstructorsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SearchPage } from "./pages/SearchPage";
import { StudentsPage } from "./pages/StudentsPage";
import { SuccessCenterPage } from "./pages/SuccessCenterPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            path="students"
            element={
              <RoleRoute roles={["admin"]}>
                <StudentsPage />
              </RoleRoute>
            }
          />
          <Route
            path="instructors"
            element={
              <RoleRoute roles={["admin"]}>
                <InstructorsPage />
              </RoleRoute>
            }
          />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="copilot" element={<CopilotPage />} />
          <Route
            path="class-studio"
            element={
              <RoleRoute roles={["admin", "instructor"]}>
                <ClassStudioPage />
              </RoleRoute>
            }
          />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route
            path="attendance"
            element={
              <RoleRoute roles={["admin", "instructor"]}>
                <AttendancePage />
              </RoleRoute>
            }
          />
          <Route
            path="success-center"
            element={
              <RoleRoute roles={["admin", "instructor"]}>
                <SuccessCenterPage />
              </RoleRoute>
            }
          />
          <Route
            path="reports"
            element={
              <RoleRoute roles={["admin"]}>
                <ReportsPage />
              </RoleRoute>
            }
          />
          <Route
            path="cms"
            element={
              <RoleRoute roles={["admin"]}>
                <CmsPage />
              </RoleRoute>
            }
          />
          <Route
            path="content"
            element={
              <RoleRoute roles={["student"]}>
                <ContentPage />
              </RoleRoute>
            }
          />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route
            path="search"
            element={
              <RoleRoute roles={["admin", "instructor"]}>
                <SearchPage />
              </RoleRoute>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
