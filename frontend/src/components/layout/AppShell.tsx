import {
  Bell,
  Award,
  BookOpen,
  BrainCircuit,
  Bot,
  CalendarDays,
  ClipboardCheck,
  FileText,
  FileBarChart,
  Gauge,
  GraduationCap,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Search,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { useSocket } from "../../hooks/useSocket";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import type { Role } from "../../types";

const navItems: { to: string; label: string; icon: LucideIcon; roles: Role[] }[] = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "instructor"] },
  { to: "/portal", label: "Home", icon: Home, roles: ["student"] },
  { to: "/portal/copilot", label: "Copilot", icon: Bot, roles: ["admin", "instructor", "student"] },
  { to: "/portal/students", label: "Students", icon: Users, roles: ["admin"] },
  { to: "/portal/instructors", label: "Instructors", icon: GraduationCap, roles: ["admin"] },
  { to: "/portal/applications", label: "Applications", icon: FileText, roles: ["admin"] },
  { to: "/portal/courses", label: "Courses", icon: BookOpen, roles: ["admin", "instructor"] },
  { to: "/portal/documents", label: "Documents", icon: FileText, roles: ["admin", "student"] },
  { to: "/portal/gradebook", label: "Gradebook", icon: Award, roles: ["admin", "instructor", "student"] },
  { to: "/portal/content", label: "Lessons", icon: BookOpen, roles: ["student"] },
  { to: "/portal/class-studio", label: "Class Studio", icon: CalendarDays, roles: ["admin", "instructor"] },
  { to: "/portal/quizzes", label: "Quizzes", icon: BrainCircuit, roles: ["admin", "instructor", "student"] },
  { to: "/portal/assignments", label: "Assignments", icon: ClipboardCheck, roles: ["admin", "instructor"] },
  { to: "/portal/assignments", label: "Work", icon: ClipboardCheck, roles: ["student"] },
  { to: "/portal/attendance", label: "Attendance", icon: Gauge, roles: ["admin", "instructor"] },
  { to: "/portal/success-center", label: "Success Center", icon: LifeBuoy, roles: ["admin", "instructor"] },
  { to: "/portal/reports", label: "Reports", icon: FileBarChart, roles: ["admin"] },
  { to: "/portal/cms", label: "CMS", icon: Megaphone, roles: ["admin"] },
  { to: "/portal/notifications", label: "Notifications", icon: Bell, roles: ["admin", "instructor"] },
  { to: "/portal/notifications", label: "Inbox", icon: Bell, roles: ["student"] },
  { to: "/portal/search", label: "Search", icon: Search, roles: ["admin", "instructor"] }
];

function navLabel(label: string, role: Role) {
  if (label !== "Dashboard") return label;
  if (role === "instructor") return "Teaching";
  return "Dashboard";
}

export function AppShell() {
  const { user, logout } = useAuth();
  useSocket(Boolean(user));
  const visibleItems = navItems.filter((item) => item.roles.includes(user!.role));

  return (
    <div className={cn("min-h-screen bg-background", user?.role === "student" && "bg-slate-50")}>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white">
            <GraduationCap size={22} />
          </div>
          <div>
            <p className="font-semibold text-slate-950">EduCore</p>
            <p className="text-xs text-slate-500">LMS & DMS</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-muted hover:text-slate-950",
                  isActive && "bg-teal-50 text-primary"
                )
              }
            >
              <item.icon size={18} />
              {navLabel(item.label, user!.role)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur lg:px-8">
          <div>
            <p className="text-sm font-medium text-slate-950">{user?.fullName}</p>
            <p className="text-xs capitalize text-slate-500">{user?.role === "student" ? "Student portal" : user?.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <NavLink to="/portal/notifications" className="rounded-md p-2 text-slate-500 hover:bg-muted hover:text-slate-900" title="Notifications">
              <Bell size={19} />
            </NavLink>
            {user?.role === "admin" ? (
              <NavLink to="/portal/cms" className="rounded-md p-2 text-slate-500 hover:bg-muted hover:text-slate-900" title="CMS">
                <Megaphone size={19} />
              </NavLink>
            ) : null}
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut size={16} />
              Logout
            </Button>
          </div>
        </header>
        <nav className="grid grid-cols-5 gap-1 border-b border-border bg-white p-2 lg:hidden">
          {visibleItems.slice(0, 10).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-slate-500",
                  isActive && "bg-teal-50 text-primary"
                )
              }
              title={item.label}
            >
              <item.icon size={17} />
              <span className="max-w-full truncate">{navLabel(item.label, user!.role)}</span>
            </NavLink>
          ))}
        </nav>
        <main className={cn("mx-auto px-4 py-6 lg:px-8", user?.role === "student" ? "max-w-6xl" : "max-w-7xl")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
