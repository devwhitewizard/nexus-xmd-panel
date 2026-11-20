"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Moon, Sun, UserCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard Overview",
  "/bots": "My Bots",
  "/bots/deploy": "Deploy Bot",
  "/panels": "Panel Servers",
  "/currency": "Currency Converter",
  "/account": "Account & Wallet",
  "/admin": "Admin Console",
};

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  };

  const title =
    PAGE_TITLES[pathname] ||
    (pathname.startsWith("/bots/") ? "Bot Details" : "Nexus XMD Panel");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-muted-foreground">Nexus XMD</p>
          <h2 className="text-sm font-semibold text-foreground sm:text-base">{title}</h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm hover:bg-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold uppercase text-primary">
              {user?.username?.slice(0, 2) || "NX"}
            </div>
            <span className="hidden font-medium text-foreground sm:inline">
              {user?.username}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-border bg-card p-1.5 shadow-lg">
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{user?.username}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                Account Profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

