"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FileText,
  RefreshCw,
  Save,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  getPlatformSettings,
  listAdminOrders,
  listAdminUsers,
  listAuditLogs,
  upsertPlatformSetting,
  type PlatformSetting,
} from "@/services/admin.service";
import { getBwmAccountBalance } from "@/services/account.service";
import { ApiClientError } from "@/services/apiClient";
import type { AdminOrder, AuditLog, BwmAccountBalance, User } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

type AdminTab = "orders" | "users" | "audit" | "settings";

function AdminConsoleContent() {
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");

  const [bwmBalance, setBwmBalance] = useState<BwmAccountBalance | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<PlatformSetting[]>([]);

  const [settingKey, setSettingKey] = useState("");
  const [settingValue, setSettingValue] = useState("{}");
  const [settingDesc, setSettingDesc] = useState("");
  const [savingSetting, setSavingSetting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, usersRes, logsRes, settingsRes, balanceRes] = await Promise.all([
        listAdminOrders(orderStatusFilter),
        listAdminUsers(),
        listAuditLogs(),
        getPlatformSettings(),
        getBwmAccountBalance().catch(() => null),
      ]);
      setOrders(ordersRes);
      setUsers(usersRes);
      setAuditLogs(logsRes);
      setSettings(settingsRes);
      setBwmBalance(balanceRes);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to load admin console"
      );
    } finally {
      setLoading(false);
    }
  }, [orderStatusFilter]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingKey.trim()) {
      toast.error("Setting key is required");
      return;
    }
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(settingValue);
    } catch {
      parsedValue = settingValue;
    }

    setSavingSetting(true);
    try {
      await upsertPlatformSetting({
        key: settingKey.trim(),
        value: parsedValue,
        description: settingDesc.trim() || undefined,
      });
      toast.success("Platform setting saved");
      setSettingKey("");
      setSettingValue("{}");
      setSettingDesc("");
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to save setting");
    } finally {
      setSavingSetting(false);
    }
  };

  const uncertainCount = orders.filter((o) => o.status === "uncertain").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Console"
        description="Manage platform customers, orders, audit logs, settings, and BWM reseller metrics."
        actions={
          <Button variant="outline" size="sm" onClick={loadAdminData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadAdminData} /> : null}

      {loading ? (
        <div className="space-y-6">
          <CardsSkeleton count={4} />
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="BWM XD Wallet"
              value={`${bwmBalance?.xd_balance ?? "—"} XD`}
              subtitle={`Referral: ${bwmBalance?.referral_balance ?? 0} XD`}
              icon={Wallet}
            />
            <StatCard
              title="Registered Users"
              value={users.length}
              subtitle="Customers & administrators"
              icon={Users}
            />
            <StatCard
              title="Platform Orders"
              value={orders.length}
              subtitle={`${uncertainCount} uncertain needing review`}
              icon={ShoppingCart}
            />
            <StatCard
              title="BWM API Requests"
              value={bwmBalance?.usage?.total_requests ?? 0}
              subtitle="Reseller key total calls"
              icon={Activity}
            />
          </div>

          {/* Admin Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-2">
            <Button
              type="button"
              size="sm"
              variant={activeTab === "orders" ? "default" : "ghost"}
              onClick={() => setActiveTab("orders")}
            >
              <ShoppingCart className="h-4 w-4" />
              Orders ({orders.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "users" ? "default" : "ghost"}
              onClick={() => setActiveTab("users")}
            >
              <Users className="h-4 w-4" />
              Users ({users.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "audit" ? "default" : "ghost"}
              onClick={() => setActiveTab("audit")}
            >
              <FileText className="h-4 w-4" />
              Audit Logs ({auditLogs.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "settings" ? "default" : "ghost"}
              onClick={() => setActiveTab("settings")}
            >
              <Settings className="h-4 w-4" />
              Settings ({settings.length})
            </Button>
          </div>

          {activeTab === "orders" ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Platform Orders</CardTitle>
                  <CardDescription>All customer orders and paid operation statuses</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["all", "completed", "uncertain", "failed", "pending"].map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={orderStatusFilter === s ? "default" : "outline"}
                      className="capitalize"
                      onClick={() => setOrderStatusFilter(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <EmptyState
                    icon={ShoppingCart}
                    title="No orders found"
                    description="Platform orders matching the selected filter will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2.5 pr-4">Service</th>
                          <th className="py-2.5 pr-4">Status</th>
                          <th className="py-2.5 pr-4">Days</th>
                          <th className="py-2.5 pr-4">Charged XD</th>
                          <th className="py-2.5 pr-4">Balance After</th>
                          <th className="py-2.5">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orders.map((order) => (
                          <tr key={order.id}>
                            <td className="py-2.5 pr-4 font-mono text-xs">{order.service_type}</td>
                            <td className="py-2.5 pr-4">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="py-2.5 pr-4 text-xs">{order.days ?? "—"}</td>
                            <td className="py-2.5 pr-4 text-xs font-medium">
                              {order.charged_xd !== null ? `${order.charged_xd} XD` : "—"}
                            </td>
                            <td className="py-2.5 pr-4 text-xs">
                              {order.balance_after !== null ? `${order.balance_after} XD` : "—"}
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
          ) : null}

          {activeTab === "users" ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer & Admin Users</CardTitle>
                <CardDescription>Registered accounts from GET /api/admin/users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Username</th>
                        <th className="py-2.5 pr-4">Email</th>
                        <th className="py-2.5 pr-4">Role</th>
                        <th className="py-2.5 pr-4">Wallet</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td className="py-2.5 pr-4 font-medium">{u.username}</td>
                          <td className="py-2.5 pr-4 text-xs text-muted-foreground">{u.email}</td>
                          <td className="py-2.5 pr-4 capitalize">{u.role}</td>
                          <td className="py-2.5 pr-4 text-xs">
                            {Number(u.wallet_balance ?? 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={u.is_active ? "active" : "inactive"} />
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "audit" ? (
            <Card>
              <CardHeader>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>Security and billing events from GET /api/admin/audit-logs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Action</th>
                        <th className="py-2.5 pr-4">Resource</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 pr-4 font-mono text-xs font-medium">
                            {log.action}
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                            {log.resource_type}
                            {log.resource_id ? ` (${log.resource_id.slice(0, 8)}...)` : ""}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={log.status} />
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "settings" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Save Platform Setting</CardTitle>
                  <CardDescription>Upsert key/value JSON via PUT /api/admin/settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveSetting} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="setting_key">Key</Label>
                      <Input
                        id="setting_key"
                        placeholder="maintenance_mode"
                        value={settingKey}
                        onChange={(e) => setSettingKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="setting_value">Value (JSON or string)</Label>
                      <Input
                        id="setting_value"
                        placeholder='{"enabled": false}'
                        className="font-mono text-xs"
                        value={settingValue}
                        onChange={(e) => setSettingValue(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="setting_desc">Description (Optional)</Label>
                      <Input
                        id="setting_desc"
                        placeholder="Controls platform maintenance banner"
                        value={settingDesc}
                        onChange={(e) => setSettingDesc(e.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={savingSetting}>
                      <Save className="h-4 w-4" />
                      {savingSetting ? "Saving..." : "Save Setting"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Existing Settings</CardTitle>
                  <CardDescription>Stored in platform_settings</CardDescription>
                </CardHeader>
                <CardContent>
                  {settings.length === 0 ? (
                    <EmptyState
                      icon={Settings}
                      title="No settings saved"
                      description="Add a platform configuration key on the left."
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {settings.map((s) => (
                        <div key={s.key} className="py-3">
                          <p className="font-mono text-xs font-semibold text-foreground">
                            {s.key}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {JSON.stringify(s.value)}
                          </p>
                          {s.description ? (
                            <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminConsoleContent />
    </RoleGuard>
  );
}

