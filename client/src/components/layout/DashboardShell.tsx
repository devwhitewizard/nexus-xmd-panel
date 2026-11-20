"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobileMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

