import { apiRequest } from "@/services/apiClient";

export interface CurrencyRateItem {
  currency: string;
  country?: string;
  symbol?: string;
  ksh_per_unit?: number;
  unit_per_ksh?: number;
  xd_per_unit?: number;
}

export interface CurrencyRatesPayload {
  base?: Record<string, unknown>;
  aliases?: Record<string, string>;
  currencies: CurrencyRateItem[];
  updated_at?: string;
}

export async function getCurrencyRates(): Promise<CurrencyRatesPayload> {
  return apiRequest<CurrencyRatesPayload>({
    method: "GET",
    url: "/currency/rates",
  });
}

export async function convertCurrency(payload: {
  amount: number;
  from: string;
  to: string;
}): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>({
    method: "POST",
    url: "/currency/convert",
    data: payload,
  });
}

