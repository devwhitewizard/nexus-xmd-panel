"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPanelPlans,
  listMyPanels,
  provisionPanel,
  type PanelPlan,
  type PanelServerRecord,
  type ProvisionPanelResult,
} from "@/services/panels.service";
import { ApiClientError } from "@/services/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { cn } from "@/lib/utils";

export default function PanelsPage() {
  const [plans, setPlans] = useState<PanelPlan[]>([]);
  const [servers, setServers] = useState<PanelServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionPanelResult | null>(null);
  const [uncertainWarning, setUncertainWarning] = useState<string | null>(null);

  const loadPanelsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, serversRes] = await Promise.all([
        getPanelPlans(),
        listMyPanels(),
      ]);
      const plansList = plansRes.plans || [];
      setPlans(plansList);
      setServers(serversRes);
      if (plansList.length > 0 && !selectedPlan) {
        setSelectedPlan(plansList[0].id);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to load panel plans and records"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPlan]);

  useEffect(() => {
    loadPanelsData();
  }, [loadPanelsData]);

  const activePlan = plans.find((p) => p.id === selectedPlan);

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      toast.error("Please select a panel plan");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username.trim())) {
      toast.error("Username must be 3-32 characters (letters, numbers, underscores, hyphens)");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmProvision = async () => {
    setProvisioning(true);
    setUncertainWarning(null);
    try {
      const res = await provisionPanel({
        username: username.trim(),
        password,
        plan: selectedPlan,
      });
      setProvisionResult(res);
      setUsername("");
      setPassword("");
      setConfirmOpen(false);
      toast.success("Panel server provisioned successfully!");
      await loadPanelsData();
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ApiClientError && err.code === "UNCERTAIN_PAID_OPERATION") {
        setUncertainWarning(
          `${err.message} Check existing server records before attempting another provisioning request.`
        );
        toast.warning("Provisioning outcome uncertain — verify before retrying.");
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : "Panel provisioning failed"
        );
      }
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel Servers"
        description="Compare live panel plans, provision a new server, and view your saved server records."
        actions={
          <Button variant="outline" size="sm" onClick={loadPanelsData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadPanelsData} /> : null}

      {uncertainWarning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Uncertain Provisioning Outcome</p>
            <p className="mt-1">{uncertainWarning}</p>
          </div>
        </div>
      ) : null}

      {provisionResult ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Panel Server Provisioned
            </CardTitle>
            <CardDescription>
              Save these credentials securely. Passwords are not stored in plaintext on our server.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Panel URL</p>
              {provisionResult.panel_credentials.panel_url ? (
                <a
                  href={provisionResult.panel_credentials.panel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Open Panel <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="font-mono text-xs">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Username</p>
              <p className="font-mono font-medium">{provisionResult.panel_credentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Charged XD</p>
              <p className="font-medium">
                {provisionResult.billing?.charged_xd !== null
                  ? `${provisionResult.billing.charged_xd} XD`
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-6">
          <CardsSkeleton count={3} />
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <>
          {/* Live Plans */}
          <Card>
            <CardHeader>
              <CardTitle>Available Panel Plans</CardTitle>
              <CardDescription>
                Live plans from GET /api/panels/plans (billed in XD)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="No Panel Plans Found"
                  description="No plans were returned from the provider."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => {
                    const active = selectedPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlan(plan.id)}
                        className={cn(
                          "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                          active
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="flex items-center gap-2 font-semibold text-foreground">
                            <Cpu className="h-4 w-4 text-primary" />
                            {plan.name}
                          </span>
                          {active ? <Badge>Selected</Badge> : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">RAM: {plan.ram}</p>
                        <p className="mt-2 text-lg font-bold text-foreground">
                          {plan.price_xd} XD
                        </p>
                        {plan.local_formatted ? (
                          <p className="text-xs text-muted-foreground">{plan.local_formatted}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provisioning Form */}
          <Card>
            <CardHeader>
              <CardTitle>Provision Panel Server</CardTitle>
              <CardDescription>
                Create a new panel account on the selected plan ({activePlan?.name || "None"})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitForm} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="panel_username">Panel Username *</Label>
                  <Input
                    id="panel_username"
                    placeholder="nexus_panel_user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="panel_password">Panel Password *</Label>
                  <Input
                    id="panel_password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={!selectedPlan || provisioning}>
                    {provisioning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Provisioning...
                      </>
                    ) : (
                      "Review & Provision Server"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Saved Server Records */}
          <Card>
            <CardHeader>
              <CardTitle>Saved Panel Server Records</CardTitle>
              <CardDescription>
                Your provisioned servers stored in Supabase PostgreSQL
              </CardDescription>
            </CardHeader>
            <CardContent>
              {servers.length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="No Provisioned Panels Yet"
                  description="Servers you provision will be saved here for quick access."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-4">Username</th>
                        <th className="py-2.5 pr-4">Plan</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 pr-4">Panel URL</th>
                        <th className="py-2.5">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {servers.map((srv) => (
                        <tr key={srv.id}>
                          <td className="py-2.5 pr-4 font-mono text-xs font-medium">
                            {srv.username}
                          </td>
                          <td className="py-2.5 pr-4 text-xs">
                            {srv.plan_name || srv.plan_id}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={srv.status} />
                          </td>
                          <td className="py-2.5 pr-4 text-xs">
                            {srv.panel_url ? (
                              <a
                                href={srv.panel_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {new Date(srv.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Paid Panel Provisioning"
        description={
          activePlan
            ? `Provision "${activePlan.name}" (${activePlan.price_xd} XD) for username "${username}"? Paid operations cannot be automatically retried.`
            : ""
        }
        confirmLabel="Confirm & Provision"
        loading={provisioning}
        onConfirm={handleConfirmProvision}
      />
    </div>
  );
}
