"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  Clock,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  Shield,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { listBots } from "@/services/bots.service";
import { getBwmAccountBalance } from "@/services/account.service";
import { ApiClientError } from "@/services/apiClient";
import type { BotRecord, BwmAccountBalance } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

export default function DashboardPage() {
  const { user } = useAuth();
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [bwmBalance, setBwmBalance] = useState<BwmAccountBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const botsData = await listBots();
      setBots(botsData);

      if (user?.role === "admin") {
        try {
          const balanceData = await getBwmAccountBalance();
          setBwmBalance(balanceData);
        } catch {
          // Admin upstream BWM balance may fail independently; keep main dashboard usable
          setBwmBalance(null);
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to load dashboard data"
      );
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const active = bots.filter((b) =>
      ["running", "active", "deploying"].includes((b.status || "").toLowerCase())
    ).length;
    const stopped = bots.filter((b) =>
      ["stopped", "inactive"].includes((b.status || "").toLowerCase())
    ).length;
    const expiringSoon = bots.filter(
      (b) => typeof b.days_remaining === "number" && b.days_remaining > 0 && b.days_remaining <= 7
    ).length;

    return { active, stopped, expiringSoon, total: bots.length };
  }, [bots]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {
      Running: 0,
      Deploying: 0,
      Stopped: 0,
      Failed: 0,
    };
    for (const bot of bots) {
      const s = (bot.status || "").toLowerCase();
      if (s === "running" || s === "active") counts.Running += 1;
      else if (s === "deploying" || s === "pending") counts.Deploying += 1;
      else if (s === "stopped" || s === "inactive") counts.Stopped += 1;
      else counts.Failed += 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [bots]);

  const recentBots = bots.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.username || "Reseller"}`}
        description="Monitor your deployed bots, subscription expirations, and platform activity."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link href="/bots/deploy">
                <PlusCircle className="h-4 w-4" />
                Deploy Bot
              </Link>
            </Button>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadDashboard} /> : null}

      {loading ? (
        <div className="space-y-6">
          <CardsSkeleton count={4} />
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <>
          {/* Customer / Platform Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Platform Wallet"
              value={`${Number(user?.wallet_balance ?? 0).toFixed(2)}`}
              subtitle="Your customer account balance"
              icon={Wallet}
            />
            <StatCard
              title="Active Bots"
              value={stats.active}
              subtitle={`${stats.total} total deployed`}
              icon={PlayCircle}
              iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              title="Stopped Bots"
              value={stats.stopped}
              subtitle="Paused or inactive instances"
              icon={PauseCircle}
              iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
            <StatCard
              title="Expiring Soon"
              value={stats.expiringSoon}
              subtitle="Within 7 days"
              icon={Clock}
              iconClassName="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            />
          </div>

          {/* Admin-only Reseller BWM Snapshot */}
          {user?.role === "admin" && bwmBalance ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <CardTitle>Reseller BWM Account (Admin Only)</CardTitle>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin">Open Admin Console</Link>
                  </Button>
                </div>
                <CardDescription>
                  Upstream BWM XMD reseller wallet and API key usage
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3.5">
                  <p className="text-xs text-muted-foreground">BWM XD Wallet</p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {bwmBalance.xd_balance ?? "—"} XD
                  </p>
                  {bwmBalance.local_currency ? (
                    <p className="text-xs text-muted-foreground">
                      {bwmBalance.local_currency.symbol}{" "}
                      {bwmBalance.local_currency.wallet_balance ?? "—"}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-card p-3.5">
                  <p className="text-xs text-muted-foreground">Referral Balance</p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {bwmBalance.referral_balance ?? 0} XD
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3.5">
                  <p className="text-xs text-muted-foreground">Total BWM API Requests</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xl font-bold text-foreground">
                    <Activity className="h-4 w-4 text-primary" />
                    {bwmBalance.usage?.total_requests ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Bot Status Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Bot Status Overview</CardTitle>
                <CardDescription>Distribution across your owned bots</CardDescription>
              </CardHeader>
              <CardContent>
                {bots.length === 0 ? (
                  <EmptyState
                    icon={Bot}
                    title="No bot metrics yet"
                    description="Deploy your first bot to view status analytics."
                  />
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis allowDecimals={false} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recently Deployed Bots */}
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recently Deployed Bots</CardTitle>
                  <CardDescription>Latest instances owned by your account</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/bots">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {recentBots.length === 0 ? (
                  <EmptyState
                    icon={Bot}
                    title="No bots deployed yet"
                    description="Deploy a BWM XMD bot from live templates to get started."
                    actionLabel="Deploy Your First Bot"
                    onAction={() => {
                      window.location.href = "/bots/deploy";
                    }}
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {recentBots.map((bot) => (
                      <div
                        key={bot.id}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/bots/${bot.id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {bot.custom_name || bot.app_name}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">
                            {bot.app_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={bot.status} />
                          <span className="text-xs text-muted-foreground">
                            {typeof bot.days_remaining === "number"
                              ? `${bot.days_remaining}d left`
                              : "No expiry"}
                          </span>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/bots/${bot.id}`}>Manage</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

