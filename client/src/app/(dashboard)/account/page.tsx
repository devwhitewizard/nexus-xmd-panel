"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Bot,
  Calendar,
  Mail,
  RefreshCw,
  Shield,
  UserCircle,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { listBots } from "@/services/bots.service";
import { getBwmAccountBalance, getBwmAccountOrders } from "@/services/account.service";
import {
  getMyOrders,
  getMyTransactions,
  type CustomerOrder,
  type CustomerTransaction,
} from "@/services/orders.service";
import { ApiClientError } from "@/services/apiClient";
import type { BotRecord, BwmAccountBalance, BwmApiOrderCall } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

function AccountPageContent() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === "admin";
  const initialTab = isAdmin && searchParams.get("tab") === "bwm" ? "bwm" : "profile";

  const [activeTab, setActiveTab] = useState<"profile" | "bwm">(initialTab);
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [myOrders, setMyOrders] = useState<CustomerOrder[]>([]);
  const [myTransactions, setMyTransactions] = useState<CustomerTransaction[]>([]);
  const [bwmBalance, setBwmBalance] = useState<BwmAccountBalance | null>(null);
  const [bwmOrders, setBwmOrders] = useState<BwmApiOrderCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin && searchParams.get("tab") === "bwm") {
      setActiveTab("bwm");
    }
  }, [isAdmin, searchParams]);

  const loadAccountData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshUser();
      const [botsData, ordersData, txData] = await Promise.all([
        listBots(),
        getMyOrders(),
        getMyTransactions(),
      ]);
      setBots(botsData);
      setMyOrders(ordersData);
      setMyTransactions(txData);

      if (isAdmin) {
        const [balanceRes, ordersRes] = await Promise.all([
          getBwmAccountBalance(),
          getBwmAccountOrders(),
        ]);
        setBwmBalance(balanceRes);
        setBwmOrders(ordersRes.orders || []);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to load account details"
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, refreshUser]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const botStats = useMemo(() => {
    const active = bots.filter((b) =>
      ["running", "active", "deploying"].includes((b.status || "").toLowerCase())
    ).length;
    const stopped = bots.filter((b) =>
      ["stopped", "inactive"].includes((b.status || "").toLowerCase())
    ).length;
    return { total: bots.length, active, stopped };
  }, [bots]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account & Wallet"
        description="Manage your profile, platform wallet balance, and bot ownership summary."
        actions={
          <Button variant="outline" size="sm" onClick={loadAccountData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {isAdmin ? (
        <div className="flex gap-2 border-b border-border pb-2">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "profile" ? "default" : "ghost"}
            onClick={() => setActiveTab("profile")}
          >
            <UserCircle className="h-4 w-4" />
            My Account
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "bwm" ? "default" : "ghost"}
            onClick={() => setActiveTab("bwm")}
          >
            <Shield className="h-4 w-4" />
            BWM Reseller Account (Admin)
          </Button>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={loadAccountData} /> : null}

      {loading ? (
        <div className="space-y-6">
          <CardsSkeleton count={3} />
          <TableSkeleton rows={4} />
        </div>
      ) : activeTab === "profile" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Platform Wallet"
              value={`${Number(user?.wallet_balance ?? 0).toFixed(2)}`}
              subtitle="Your customer platform balance"
              icon={Wallet}
            />
            <StatCard
              title="Owned Bots"
              value={botStats.total}
              subtitle={`${botStats.active} active · ${botStats.stopped} stopped`}
              icon={Bot}
            />
            <StatCard
              title="Account Role"
              value={(user?.role || "customer").toUpperCase()}
              subtitle={user?.is_active ? "Account active" : "Account disabled"}
              icon={Shield}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Authenticated customer details from /api/auth/me</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3.5">
                <UserCircle className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Username</p>
                  <p className="text-sm font-medium text-foreground">{user?.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3.5">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3.5">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="text-sm font-medium text-foreground">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3.5">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Account ID</p>
                  <p className="font-mono text-xs text-foreground">{user?.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Orders ({myOrders.length})</CardTitle>
              <CardDescription>
                Your recent service orders from GET /api/orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myOrders.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No Orders Yet"
                  description="Your bot deployments, extensions, and panel provisioning orders will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Service</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 pr-4">Duration</th>
                        <th className="py-2.5 pr-4">Amount</th>
                        <th className="py-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="py-2.5 pr-4 font-mono text-xs">{order.service_type}</td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="py-2.5 pr-4 text-xs">
                            {order.days ? `${order.days} days` : "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-xs font-medium">
                            {order.charged_xd !== null ? `${order.charged_xd} XD` : "—"}
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction History ({myTransactions.length})</CardTitle>
              <CardDescription>
                Your ledger records from GET /api/transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myTransactions.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No Transactions Yet"
                  description="Completed and pending ledger entries for your account will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Description</th>
                        <th className="py-2.5 pr-4">Direction</th>
                        <th className="py-2.5 pr-4">Amount</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2.5 pr-4 text-xs">{tx.description || "—"}</td>
                          <td className="py-2.5 pr-4 text-xs capitalize">{tx.direction}</td>
                          <td className="py-2.5 pr-4 text-xs font-medium">
                            {tx.amount} {tx.currency}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
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
      ) : isAdmin ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="BWM XD Wallet"
              value={`${bwmBalance?.xd_balance ?? "—"} XD`}
              subtitle={
                bwmBalance?.local_currency
                  ? `${bwmBalance.local_currency.symbol} ${bwmBalance.local_currency.wallet_balance ?? "—"} (${bwmBalance.local_currency.code})`
                  : "Upstream reseller wallet"
              }
              icon={Wallet}
            />
            <StatCard
              title="Referral Balance"
              value={`${bwmBalance?.referral_balance ?? 0} XD`}
              subtitle="BWM reseller referral earnings"
              icon={Shield}
            />
            <StatCard
              title="API Usage"
              value={bwmBalance?.usage?.total_requests ?? 0}
              subtitle={
                bwmBalance?.usage?.last_used_at
                  ? `Last used ${new Date(bwmBalance.usage.last_used_at).toLocaleString()}`
                  : "No recent requests"
              }
              icon={Activity}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent BWM API Calls (Last 200)</CardTitle>
              <CardDescription>
                Upstream reseller API call history from GET /api/account/orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bwmOrders.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No BWM API calls recorded"
                  description="API call logs from BWM XMD will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Method</th>
                        <th className="py-2.5 pr-4">Endpoint</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 pr-4">Charged XD</th>
                        <th className="py-2.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bwmOrders.map((call, index) => (
                        <tr key={`${call.timestamp}-${index}`}>
                          <td className="py-2.5 pr-4 font-mono text-xs font-semibold">
                            {call.method}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{call.endpoint}</td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge
                              status={call.status_code < 400 ? "success" : "failed"}
                            />
                          </td>
                          <td className="py-2.5 pr-4 font-medium">
                            {call.charged_xd ?? 0} XD
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {call.timestamp
                              ? new Date(call.timestamp).toLocaleString()
                              : "—"}
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
      ) : null}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<CardsSkeleton count={3} />}>
      <AccountPageContent />
    </Suspense>
  );
}

