import { apiRequest } from "@/services/apiClient";
import type { BwmAccountBalance, BwmApiOrderCall } from "@/types/api";

export async function getBwmAccountBalance(): Promise<BwmAccountBalance> {
  return apiRequest<BwmAccountBalance>({
    method: "GET",
    url: "/account/balance",
  });
}

export async function getBwmAccountOrders(): Promise<{
  total: number;
  orders: BwmApiOrderCall[];
}> {
  return apiRequest<{ total: number; orders: BwmApiOrderCall[] }>({
    method: "GET",
    url: "/account/orders",
  });
}

