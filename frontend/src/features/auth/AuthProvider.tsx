import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, tokenStore } from "../../services/api";
import type { User } from "../../types";

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    role: "admin" | "instructor" | "student";
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      if (!tokenStore.accessToken && !tokenStore.refreshToken) {
        if (mounted) setIsLoading(false);
        return;
      }
      try {
        const response = await api.get<{ user: User }>("/auth/me");
        if (mounted) setUser(response.user);
      } catch {
        tokenStore.accessToken = null;
        tokenStore.refreshToken = null;
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email, password) {
        const response = await api.post<AuthResponse>("/auth/login", { email, password });
        tokenStore.accessToken = response.accessToken;
        tokenStore.refreshToken = response.refreshToken;
        setUser(response.user);
      },
      async register(input) {
        const response = await api.post<AuthResponse>("/auth/register", input);
        tokenStore.accessToken = response.accessToken;
        tokenStore.refreshToken = response.refreshToken;
        setUser(response.user);
      },
      async logout() {
        await api.post("/auth/logout", { refreshToken: tokenStore.refreshToken }).catch(() => undefined);
        tokenStore.accessToken = null;
        tokenStore.refreshToken = null;
        setUser(null);
        queryClient.clear();
      }
    }),
    [isLoading, queryClient, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

