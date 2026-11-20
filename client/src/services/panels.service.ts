import { apiRequest } from "@/services/apiClient";

export interface PanelPlan {
  id: string;
  name: string;
  ram: string;
  price_xd: number;
  price_ksh?: number;
  price_local?: number;
  local_currency?: string;
  local_symbol?: string;
  local_formatted?: string;
}

export interface PanelPlansPayload {
  billing_currency?: string;
  local_currency?: string;
  local_symbol?: string;
  note?: string;
  plans: PanelPlan[];
}

export interface PanelServerRecord {
  id: string;
  user_id: string;
  bwm_panel_id: string | null;
  plan_id: string;
  plan_name: string | null;
  panel_url: string | null;
  username: string;
  status: string;
  created_at: string;
}

export interface ProvisionPanelResult {
  server: PanelServerRecord;
  panel_credentials: {
    panel_url: string | null;
    username: string;
    password?: string;
  };
  billing: {
    order_id: string;
    charged_xd: number | null;
    balance_after: number | null;
  };
}

export async function getPanelPlans(): Promise<PanelPlansPayload> {
  return apiRequest<PanelPlansPayload>({
    method: "GET",
    url: "/panels/plans",
  });
}

export async function listMyPanels(): Promise<PanelServerRecord[]> {
  const data = await apiRequest<{ servers: PanelServerRecord[] }>({
    method: "GET",
    url: "/panels",
  });
  return data.servers || [];
}

export async function provisionPanel(payload: {
  username: string;
  password: string;
  plan: string;
}): Promise<ProvisionPanelResult> {
  return apiRequest<ProvisionPanelResult>({
    method: "POST",
    url: "/panels/provision",
    data: payload,
  });
}

