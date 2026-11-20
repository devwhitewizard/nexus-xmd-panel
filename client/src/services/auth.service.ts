import { apiRequest } from "@/services/apiClient";
import type { AuthPayload, User } from "@/types/api";

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function registerUser(payload: RegisterInput): Promise<AuthPayload> {
  return apiRequest<AuthPayload>({
    method: "POST",
    url: "/auth/register",
    data: payload,
  });
}

export async function loginUser(payload: LoginInput): Promise<AuthPayload> {
  return apiRequest<AuthPayload>({
    method: "POST",
    url: "/auth/login",
    data: payload,
  });
}

export async function fetchCurrentUser(): Promise<{ user: User }> {
  return apiRequest<{ user: User }>({
    method: "GET",
    url: "/auth/me",
  });
}

