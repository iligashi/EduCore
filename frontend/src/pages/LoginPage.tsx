import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../features/auth/AuthProvider";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const registerSchema = loginSchema.extend({
  fullName: z.string().min(2),
  role: z.literal("student").default("student")
});

type LoginInput = z.infer<typeof loginSchema>;
type RegisterInput = z.infer<typeof registerSchema>;

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@educore.local", password: "Password123!" }
  });
  const registerForm = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "student" }
  });

  async function handleLogin(values: LoginInput) {
    setError("");
    try {
      await login(values.email, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function handleRegister(values: RegisterInput) {
    setError("");
    try {
      await register(values);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_440px]">
      <section className="hidden bg-slate-950 lg:block">
        <div className="flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-lg font-semibold">EduCore</p>
              <p className="text-sm text-slate-300">LMS & Digital Management System</p>
            </div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-5xl font-semibold leading-tight tracking-normal">Operate courses, students, reports, and learning content from one platform.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Built with React, Express, MySQL, MongoDB, Socket.IO, role security, CMS content, reporting, and import/export workflows.
            </p>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="mb-6 flex gap-2">
              <Button className="flex-1" variant={mode === "login" ? "primary" : "secondary"} onClick={() => setMode("login")}>
                Login
              </Button>
              <Button className="flex-1" variant={mode === "register" ? "primary" : "secondary"} onClick={() => setMode("register")}>
                Register
              </Button>
            </div>
            {mode === "login" ? (
              <form className="space-y-4" onSubmit={loginForm.handleSubmit(handleLogin)}>
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <Input {...loginForm.register("email")} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Password</label>
                  <Input type="password" {...loginForm.register("password")} />
                </div>
                {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
                <Button className="w-full" disabled={loginForm.formState.isSubmitting}>
                  Sign in
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={registerForm.handleSubmit(handleRegister)}>
                <div>
                  <label className="mb-1 block text-sm font-medium">Full name</label>
                  <Input {...registerForm.register("fullName")} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <Input {...registerForm.register("email")} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Password</label>
                  <Input type="password" {...registerForm.register("password")} />
                </div>
                <input type="hidden" value="student" {...registerForm.register("role")} />
                {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
                <Button className="w-full" disabled={registerForm.formState.isSubmitting}>
                  Create account
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
