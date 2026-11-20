"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@/types/api";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from "@/services/apiClient";
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  type LoginInput,
  type RegisterInput,
} from "@/services/auth.service";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: (silent?: boolean) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(
    (silent = false) => {
      clearStoredToken();
      setUser(null);
      if (!silent) {
        toast.success("Signed out successfully");
      }
      router.replace("/login");
    },
    [router]
  );

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await fetchCurrentUser();
      setUser(data.user);
    } catch {
      clearStoredToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      toast.error("Your session has expired. Please sign in again.");
      router.replace("/login");
    });

    refreshUser();

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [refreshUser, router]);

  const login = useCallback(
    async (input: LoginInput) => {
      const payload = await loginUser(input);
      setStoredToken(payload.token);
      setUser(payload.user);
      toast.success(`Welcome back, ${payload.user.username}`);
      router.replace("/");
    },
    [router]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const payload = await registerUser(input);
      setStoredToken(payload.token);
      setUser(payload.user);
      toast.success("Account created successfully");
      router.replace("/");
    },
    [router]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

