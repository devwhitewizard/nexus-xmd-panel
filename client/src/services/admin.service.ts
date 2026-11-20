import { apiRequest } from "@/services/apiClient";
import type { AdminOrder, AuditLog, User } from "@/types/api";

export interface PlatformSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export async function listAdminOrders(status?: string): Promise<AdminOrder[]> {
  const data = await apiRequest<{ orders: AdminOrder[] }>({
    method: "GET",
    url: "/admin/orders",
    params: status && status !== "all" ? { status } : undefined,
  });
  return data.orders || [];
}

export async function listAdminUsers(): Promise<User[]> {
  const data = await apiRequest<{ users: User[] }>({
    method: "GET",
    url: "/admin/users",
  });
  return data.users || [];
}

export async function listAuditLogs(): Promise<AuditLog[]> {
  const data = await apiRequest<{ logs: AuditLog[] }>({
    method: "GET",
    url: "/admin/audit-logs",
  });
  return data.logs || [];
}

export async function getPlatformSettings(): Promise<PlatformSetting[]> {
  const data = await apiRequest<{ settings: PlatformSetting[] }>({
    method: "GET",
    url: "/admin/settings",
  });
  return data.settings || [];
}

export async function upsertPlatformSetting(payload: {
  key: string;
  value: unknown;
  description?: string;
}): Promise<PlatformSetting> {
  const data = await apiRequest<{ setting: PlatformSetting }>({
    method: "PUT",
    url: "/admin/settings",
    data: payload,
  });
  return data.setting;
}

