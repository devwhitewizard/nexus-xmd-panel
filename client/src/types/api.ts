export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: ApiErrorDetail;
}

export type UserRole = "customer" | "admin";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  wallet_balance: string | number;
  created_at: string;
  updated_at?: string;
}

export interface AuthPayload {
  user: User;
  token: string;
}

export interface BotRecord {
  id: string;
  user_id: string;
  bwm_bot_id: string;
  app_name: string;
  custom_name: string | null;
  template_id: string | null;
  status: string;
  deployed_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface BotPricingTier {
  days: number;
  price_xd: number;
  label?: string;
  price_local?: number;
  local_currency?: string;
  local_symbol?: string;
  local_formatted?: string;
}

export interface BotTemplate {
  id: string;
  name: string;
  description?: string;
  developer?: string;
  image_url?: string;
  deployment_count?: number;
  required_vars?: string[];
}

export interface BwmAccountBalance {
  username: string | null;
  email: string | null;
  xd_balance: number | null;
  referral_balance: number | null;
  currency: string;
  local_currency: {
    code?: string;
    country?: string | null;
    symbol?: string | null;
    wallet_balance?: number | null;
    referral_balance?: number | null;
  } | null;
  usage: {
    total_requests?: number;
    last_used_at?: string | null;
    key_created_at?: string | null;
  } | null;
}

export interface BwmApiOrderCall {
  endpoint: string;
  method: string;
  status_code: number;
  charged_xd: number | null;
  timestamp: string | null;
}

export interface AdminOrder {
  id: string;
  user_id: string;
  bot_id: string | null;
  service_type: string;
  bwm_order_ref: string | null;
  status: "pending" | "completed" | "failed" | "uncertain" | "refunded";
  days: number | null;
  charged_xd: string | number | null;
  balance_after: string | number | null;
  error_message: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

