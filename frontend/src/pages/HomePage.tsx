import { DashboardPage } from "./DashboardPage";
import { InstructorHomePage } from "./InstructorHomePage";
import { StudentHomePage } from "./StudentHomePage";
import { useAuth } from "../features/auth/AuthProvider";

export function HomePage() {
  const { user } = useAuth();

  if (user?.role === "admin") return <DashboardPage />;
  if (user?.role === "instructor") return <InstructorHomePage />;
  return <StudentHomePage />;
}

