import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "../../types";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading EduCore...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}
