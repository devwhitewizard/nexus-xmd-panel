import { apiRequest } from "@/services/apiClient";

export interface CustomerOrder {
  id: string;
  bot_id: string | null;
  service_type: string;
  status: string;
  days: number | null;
  charged_xd: string | number | null;
  error_message: string | null;
  created_at: string;
}

export interface CustomerTransaction {
  id: string;
  order_id: string | null;
  ledger_type: string;
  direction: string;
  amount: string | number;
  currency: string;
  balance_after: string | number | null;
  status: string;
  description: string | null;
  created_at: string;
}

export async function getMyOrders(): Promise<CustomerOrder[]> {
  const data = await apiRequest<{ orders: CustomerOrder[] }>({
    method: "GET",
    url: "/orders",
  });
  return data.orders || [];
}

export async function getMyTransactions(): Promise<CustomerTransaction[]> {
  const data = await apiRequest<{ transactions: CustomerTransaction[] }>({
    method: "GET",
    url: "/transactions",
  });
  return data.transactions || [];
}

