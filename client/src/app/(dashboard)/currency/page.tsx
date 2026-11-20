"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, DollarSign, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  convertCurrency,
  getCurrencyRates,
  type CurrencyRatesPayload,
} from "@/services/currency.service";
import { ApiClientError } from "@/services/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

export default function CurrencyPage() {
  const [ratesData, setRatesData] = useState<CurrencyRatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("50");
  const [fromCurrency, setFromCurrency] = useState("XD");
  const [toCurrency, setToCurrency] = useState("KES");
  const [converting, setConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<Record<string, unknown> | null>(null);

  const loadRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCurrencyRates();
      setRatesData(data);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to load exchange rates"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const currencyCodes = [
    "XD",
    ...(ratesData?.currencies?.map((c) => c.currency) || ["KES", "USD", "TZS", "UGX", "NGN", "GHS"]),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a positive amount to convert");
      return;
    }

    setConverting(true);
    try {
      const res = await convertCurrency({
        amount: numericAmount,
        from: fromCurrency,
        to: toCurrency,
      });
      setConversionResult(res);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Conversion failed");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Currency Converter"
        description="Convert display currencies using live BWM XMD exchange rates (billing remains in XD)."
        actions={
          <Button variant="outline" size="sm" onClick={loadRates} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Rates
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadRates} /> : null}

      {loading ? (
        <div className="space-y-6">
          <CardsSkeleton count={2} />
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                Convert Currency
              </CardTitle>
              <CardDescription>
                Live conversion via POST /api/currency/convert
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleConvert} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="any"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="from_currency">From</Label>
                    <select
                      id="from_currency"
                      value={fromCurrency}
                      onChange={(e) => setFromCurrency(e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {currencyCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="to_currency">To</Label>
                    <select
                      id="to_currency"
                      value={toCurrency}
                      onChange={(e) => setToCurrency(e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {currencyCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={converting}>
                  {converting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    "Convert"
                  )}
                </Button>
              </form>

              {conversionResult ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Conversion Result
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {String(
                      conversionResult.converted ??
                        conversionResult.result ??
                        conversionResult.to_amount ??
                        JSON.stringify(conversionResult)
                    )}{" "}
                    {toCurrency}
                  </p>
                  {conversionResult.formatted ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {String(conversionResult.formatted)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live Exchange Rates</CardTitle>
              <CardDescription>
                {ratesData?.updated_at
                  ? `Updated ${new Date(ratesData.updated_at).toLocaleString()}`
                  : "Rates from GET /api/currency/rates"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!ratesData?.currencies || ratesData.currencies.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title="No Exchange Rates Returned"
                  description="Live exchange rates will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Currency</th>
                        <th className="py-2.5 pr-4">Country</th>
                        <th className="py-2.5 pr-4">KSH / Unit</th>
                        <th className="py-2.5">XD / Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ratesData.currencies.map((c) => (
                        <tr key={c.currency}>
                          <td className="py-2.5 pr-4 font-semibold">
                            {c.currency} ({c.symbol})
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                            {c.country || "—"}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs">
                            {c.ksh_per_unit ?? "—"}
                          </td>
                          <td className="py-2.5 font-mono text-xs">
                            {c.xd_per_unit ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
