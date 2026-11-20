import { apiRequest } from "@/services/apiClient";
import type { BotPricingTier, BotRecord, BotTemplate } from "@/types/api";

export interface DeployBotInput {
  app_name: string;
  session_id: string;
  days: number;
  custom_name?: string;
  template_id?: string;
}

export interface RecoverBotInput {
  app_name?: string;
  bot_id?: string;
  session_id?: string;
  custom_name?: string;
}

export interface BotBillingResult {
  bot: BotRecord;
  billing: {
    order_id: string;
    charged_xd: number | null;
    balance_after: number | null;
  };
}

export async function getBotPricing(): Promise<BotPricingTier[]> {
  const data = await apiRequest<BotPricingTier[] | { tiers?: BotPricingTier[] }>({
    method: "GET",
    url: "/bots/pricing",
  });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.tiers)) return data.tiers;
  return [];
}

export async function getBotTemplates(): Promise<BotTemplate[]> {
  const data = await apiRequest<BotTemplate[] | { templates?: BotTemplate[] }>({
    method: "GET",
    url: "/bots/templates",
  });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.templates)) return data.templates;
  return [];
}

export async function listBots(): Promise<BotRecord[]> {
  const data = await apiRequest<{ bots: BotRecord[] }>({
    method: "GET",
    url: "/bots",
  });
  return data.bots || [];
}

export async function getBotById(id: string): Promise<BotRecord> {
  const data = await apiRequest<{ bot: BotRecord }>({
    method: "GET",
    url: `/bots/${encodeURIComponent(id)}`,
  });
  return data.bot;
}

export async function deployBot(payload: DeployBotInput): Promise<BotBillingResult> {
  return apiRequest<BotBillingResult>({
    method: "POST",
    url: "/bots/deploy",
    data: payload,
  });
}

export async function recoverBot(payload: RecoverBotInput): Promise<BotBillingResult> {
  return apiRequest<BotBillingResult>({
    method: "POST",
    url: "/bots/recover",
    data: payload,
  });
}

export async function startBot(id: string): Promise<unknown> {
  return apiRequest({
    method: "POST",
    url: `/bots/${encodeURIComponent(id)}/start`,
  });
}

export async function stopBot(id: string): Promise<unknown> {
  return apiRequest({
    method: "POST",
    url: `/bots/${encodeURIComponent(id)}/stop`,
  });
}

export async function restartBot(id: string): Promise<unknown> {
  return apiRequest({
    method: "POST",
    url: `/bots/${encodeURIComponent(id)}/restart`,
  });
}

export async function extendBot(id: string, days: number): Promise<BotBillingResult> {
  return apiRequest<BotBillingResult>({
    method: "POST",
    url: `/bots/${encodeURIComponent(id)}/extend`,
    data: { days },
  });
}

export async function getBotLogs(id: string): Promise<unknown> {
  return apiRequest({
    method: "GET",
    url: `/bots/${encodeURIComponent(id)}/logs`,
  });
}

export async function getBotVars(id: string): Promise<Record<string, string>> {
  const data = await apiRequest<
    Record<string, string> | { env_vars?: Record<string, string>; vars?: Record<string, string> }
  >({
    method: "GET",
    url: `/bots/${encodeURIComponent(id)}/vars`,
  });
  if (data && typeof data === "object") {
    if ("env_vars" in data && data.env_vars && typeof data.env_vars === "object") {
      return data.env_vars as Record<string, string>;
    }
    if ("vars" in data && data.vars && typeof data.vars === "object") {
      return data.vars as Record<string, string>;
    }
    return data as Record<string, string>;
  }
  return {};
}

export async function updateBotVars(
  id: string,
  envVars: Record<string, string>
): Promise<unknown> {
  return apiRequest({
    method: "PUT",
    url: `/bots/${encodeURIComponent(id)}/vars`,
    data: { env_vars: envVars },
  });
}

export async function deleteBot(
  id: string,
  payload: { recovery_authorized: boolean; reason?: string }
): Promise<unknown> {
  return apiRequest({
    method: "DELETE",
    url: `/bots/${encodeURIComponent(id)}`,
    data: payload,
  });
}
