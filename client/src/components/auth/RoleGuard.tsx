"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/types/api";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const isAuthorized = Boolean(user && allowedRoles.includes(user.role));

  useEffect(() => {
    if (!isLoading && !isAuthorized) {
      router.replace("/");
    }
  }, [isAuthorized, isLoading, router]);

  if (isLoading || !isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
