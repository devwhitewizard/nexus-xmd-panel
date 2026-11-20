import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:5000/api";

const TOKEN_STORAGE_KEY = "nexus_xmd_token";

export class ApiClientError extends Error {
  statusCode: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = "API_ERROR",
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

type UnauthorizedHandler = () => void;
let onUnauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorizedHandler = handler;
}

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (!error.response) {
      return Promise.reject(
        new ApiClientError(
          "Unable to reach the backend API. Ensure the server is running.",
          0,
          "NETWORK_ERROR"
        )
      );
    }

    const { status, data } = error.response;
    const message = data?.message || `Request failed with HTTP ${status}`;
    const code = data?.error?.code || "HTTP_ERROR";
    const details = data?.error?.details || {};

    if (status === 401) {
      clearStoredToken();
      if (onUnauthorizedHandler) {
        onUnauthorizedHandler();
      }
    }

    return Promise.reject(new ApiClientError(message, status, code, details));
  }
);

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await axiosInstance.request<ApiSuccessResponse<T>>(config);
  return response.data.data;
}

