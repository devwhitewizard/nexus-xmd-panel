"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/types/api";
import { EmptyState } from "@/components/shared/EmptyState";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user } = useAuth();
  const router = useRouter();

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access Restricted"
        description="You do not have permission to view this section."
        actionLabel="Return to Dashboard"
        onAction={() => router.push("/")}
      />
    );
  }

  return <>{children}</>;
}

