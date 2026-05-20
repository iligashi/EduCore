import {
  Bell,
  BookOpen,
  ClipboardCheck,
  FileBarChart,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  Settings,
  Users
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { useSocket } from "../../hooks/useSocket";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "instructor", "student"] },
  { to: "/students", label: "Students", icon: Users, roles: ["admin", "instructor", "student"] },
  { to: "/instructors", label: "Instructors", icon: GraduationCap, roles: ["admin", "instructor"] },
  { to: "/courses", label: "Courses", icon: BookOpen, roles: ["admin", "instructor", "student"] },
  { to: "/assignments", label: "Assignments", icon: ClipboardCheck, roles: ["admin", "instructor", "student"] },
  { to: "/attendance", label: "Attendance", icon: Gauge, roles: ["admin", "instructor", "student"] },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "instructor"] },
  { to: "/cms", label: "CMS", icon: Megaphone, roles: ["admin", "instructor"] },
  { to: "/notifications", label: "Notifications", icon: Bell, roles: ["admin", "instructor", "student"] },
  { to: "/search", label: "Search", icon: Search, roles: ["admin", "instructor", "student"] }
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  useSocket(Boolean(user));
  const visibleItems = navItems.filter((item) => (item.roles as readonly string[]).includes(user!.role));

  return (
    <div className="min-h-screen bg-background">
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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur lg:px-8">
          <div>
            <p className="text-sm font-medium text-slate-950">{user?.fullName}</p>
            <p className="text-xs capitalize text-slate-500">{user?.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <NavLink to="/notifications" className="rounded-md p-2 text-slate-500 hover:bg-muted hover:text-slate-900" title="Notifications">
              <Bell size={19} />
            </NavLink>
            <NavLink to="/cms" className="rounded-md p-2 text-slate-500 hover:bg-muted hover:text-slate-900" title="Settings">
              <Settings size={19} />
            </NavLink>
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
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
