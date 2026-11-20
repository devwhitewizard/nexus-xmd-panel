"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Cpu,
  DollarSign,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Server,
  Shield,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CUSTOMER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "My Bots", href: "/bots", icon: Bot },
  { label: "Deploy Bot", href: "/bots/deploy", icon: PlusCircle },
  { label: "Panel Servers", href: "/panels", icon: Server },
  { label: "Currency", href: "/currency", icon: DollarSign },
  { label: "Account", href: "/account", icon: UserCircle },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Admin Console", href: "/admin", icon: Shield },
  { label: "BWM Account", href: "/account?tab=bwm", icon: Activity },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isRouteActive = (href: string) => {
    const cleanHref = href.split("?")[0];
    if (cleanHref === "/") return pathname === "/";
    if (cleanHref === "/bots" && pathname.startsWith("/bots/deploy")) return false;
    return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
  };

  const renderNavGroup = (title: string, items: NavItem[]) => (
    <div className="space-y-1">
      {!collapsed ? (
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
      ) : null}
      {items.map((item) => {
        const Icon = item.icon;
        const active = isRouteActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onCloseMobile}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-white shadow-sm"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
              collapsed && "justify-center px-2"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </div>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden" onClick={onCloseMobile}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <Cpu className="h-4 w-4" />
          </div>
          {!collapsed ? (
            <div className="truncate">
              <p className="text-sm font-bold tracking-tight text-white">Nexus XMD</p>
              <p className="text-[11px] text-slate-400">Reseller Cloud</p>
            </div>
          ) : null}
        </Link>

        {/* Desktop collapse toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Toggle sidebar"
          className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Mobile close toggle */}
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {renderNavGroup("Platform", CUSTOMER_NAV)}
        {user?.role === "admin" ? renderNavGroup("Administration", ADMIN_NAV) : null}
      </nav>

      {/* User Profile Footer */}
      <div className="border-t border-slate-800 p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg bg-slate-800/60 p-2.5",
            collapsed && "justify-center"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold uppercase text-blue-300">
            {user?.username?.slice(0, 2) || "NX"}
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user?.username}</p>
              <p className="truncate text-[11px] capitalize text-slate-400">{user?.role}</p>
            </div>
          ) : null}
          {!collapsed ? (
            <button
              type="button"
              onClick={() => logout()}
              title="Sign out"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-slate-800 transition-all duration-200 lg:block",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebarBody}
      </aside>

      {/* Mobile Slide-out Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] shrink-0 shadow-2xl">
            {sidebarBody}
          </aside>
        </div>
      ) : null}
    </>
  );
}

