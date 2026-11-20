"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cpu, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ApiClientError } from "@/services/apiClient";
import { registerSchema, type RegisterFormValues } from "@/lib/validators/auth.schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const { register: registerAccount, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      await registerAccount(values);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : "Unable to create account. Please try again.";
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
            Create your customer account to deploy and manage bots
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>Fill in your details to get started</CardDescription>
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
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="nexus_user"
                  {...register("username")}
                />
                {errors.username ? (
                  <p className="text-xs text-destructive">{errors.username.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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
                    Creating account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Create account
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

