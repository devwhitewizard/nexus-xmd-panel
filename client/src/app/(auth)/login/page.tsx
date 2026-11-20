"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cpu, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ApiClientError } from "@/services/apiClient";
import { loginSchema, type LoginFormValues } from "@/lib/validators/auth.schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "Unable to sign in. Please try again.";
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Cpu className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Nexus XMD Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to manage your bots and reseller services
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your email and password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {serverError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {serverError}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : null}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

