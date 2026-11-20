"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  KeyRound,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  deleteBot,
  extendBot,
  getBotById,
  getBotLogs,
  getBotPricing,
  getBotVars,
  restartBot,
  startBot,
  stopBot,
  updateBotVars,
} from "@/services/bots.service";
import { ApiClientError } from "@/services/apiClient";
import type { BotPricingTier, BotRecord } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

interface EnvRow {
  key: string;
  value: string;
}

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const botId = params.id;

  const [bot, setBot] = useState<BotRecord | null>(null);
  const [pricing, setPricing] = useState<BotPricingTier[]>([]);
  const [logs, setLogs] = useState<string>("");
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | "extend" | "delete" | null>(
    null
  );
  const [extendDays, setExtendDays] = useState<number>(0);
  const [deleteReason, setDeleteReason] = useState("");

  const formatLogs = (rawLogs: unknown): string => {
    if (typeof rawLogs === "string") return rawLogs;
    if (rawLogs && typeof rawLogs === "object") {
      const obj = rawLogs as Record<string, unknown>;
      if (typeof obj.logs === "string") return obj.logs;
      if (Array.isArray(obj.logs)) return obj.logs.join("\n");
      return JSON.stringify(rawLogs, null, 2);
    }
    return "No logs available.";
  };

  const loadBotDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [botData, pricingData] = await Promise.all([
        getBotById(botId),
        getBotPricing(),
      ]);
      setBot(botData);
      setPricing(pricingData);
      if (pricingData.length > 0 && !extendDays) {
        setExtendDays(pricingData[0].days);
      }

      const [logsRes, varsRes] = await Promise.allSettled([
        getBotLogs(botId),
        getBotVars(botId),
      ]);

      if (logsRes.status === "fulfilled") {
        setLogs(formatLogs(logsRes.value));
      } else {
        setLogs("Unable to load logs.");
      }

      if (varsRes.status === "fulfilled") {
        const entries = Object.entries(varsRes.value || {}).map(([key, value]) => ({
          key,
          value: value === null || value === undefined ? "" : String(value),
        }));
        setEnvRows(entries.length > 0 ? entries : [{ key: "", value: "" }]);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load bot details");
    } finally {
      setLoading(false);
    }
  }, [botId, extendDays]);

  useEffect(() => {
    loadBotDetails();
  }, [loadBotDetails]);

  const handleRefreshLogs = async () => {
    setActionLoading("logs");
    try {
      const logsRes = await getBotLogs(botId);
      setLogs(formatLogs(logsRes));
      toast.success("Logs refreshed");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to fetch logs");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async () => {
    setActionLoading("start");
    try {
      await startBot(botId);
      toast.success("Bot start command sent");
      await loadBotDetails();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to start bot");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmedAction = async () => {
    if (!confirmAction) return;
    setActionLoading(confirmAction);
    try {
      if (confirmAction === "stop") {
        await stopBot(botId);
        toast.success("Bot stopped");
        await loadBotDetails();
      } else if (confirmAction === "restart") {
        await restartBot(botId);
        toast.success("Bot restarted");
        await loadBotDetails();
      } else if (confirmAction === "extend") {
        const res = await extendBot(botId, extendDays);
        toast.success(
          `Subscription extended by ${extendDays} days${
            res.billing?.charged_xd ? ` (${res.billing.charged_xd} XD)` : ""
          }`
        );
        await loadBotDetails();
      } else if (confirmAction === "delete") {
        await deleteBot(botId, {
          recovery_authorized: true,
          reason: deleteReason.trim() || "Authorized recovery deletion",
        });
        toast.success("Bot deleted via recovery workflow");
        router.replace("/bots");
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "UNCERTAIN_PAID_OPERATION") {
        toast.warning(
          "Extension outcome is uncertain. Check orders before retrying."
        );
      } else {
        toast.error(err instanceof ApiClientError ? err.message : "Action failed");
      }
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleSaveVars = async () => {
    const envVars: Record<string, string> = {};
    for (const row of envRows) {
      const k = row.key.trim();
      if (k) {
        envVars[k] = row.value;
      }
    }

    if (Object.keys(envVars).length === 0) {
      toast.error("Add at least one environment variable key");
      return;
    }

    setActionLoading("vars");
    try {
      await updateBotVars(botId, envVars);
      toast.success("Environment variables updated");
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : "Failed to update variables"
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <CardsSkeleton count={3} />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/bots">
            <ArrowLeft className="h-4 w-4" />
            Back to My Bots
          </Link>
        </Button>
        <ErrorBanner message={error || "Bot not found"} onRetry={loadBotDetails} />
      </div>
    );
  }

  const selectedTier = pricing.find((p) => p.days === extendDays);

  return (
    <div className="space-y-6">
      <PageHeader
        title={bot.custom_name || bot.app_name}
        description={`App: ${bot.app_name} · BWM ID: ${bot.bwm_bot_id}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/bots">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <StatusBadge status={bot.status} />
          </>
        }
      />

      {/* Lifecycle Controls & Subscription */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle Controls</CardTitle>
            <CardDescription>Start, stop, or restart this bot instance</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              disabled={actionLoading !== null}
            >
              <Play className="h-4 w-4" />
              {actionLoading === "start" ? "Starting..." : "Start"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmAction("stop")}
              disabled={actionLoading !== null}
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmAction("restart")}
              disabled={actionLoading !== null}
            >
              <RotateCw className="h-4 w-4" />
              Restart
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Subscription & Extension
            </CardTitle>
            <CardDescription>
              Expires:{" "}
              {bot.expires_at ? new Date(bot.expires_at).toLocaleString() : "—"} (
              {typeof bot.days_remaining === "number"
                ? `${bot.days_remaining} days remaining`
                : "N/A"}
              )
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
              className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {pricing.map((tier) => (
                <option key={tier.days} value={tier.days}>
                  {tier.label || `${tier.days} days`} — {tier.price_xd} XD
                  {tier.local_formatted ? ` (${tier.local_formatted})` : ""}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={!extendDays || actionLoading !== null}
              onClick={() => setConfirmAction("extend")}
            >
              Extend Bot
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Terminal-style Logs Viewer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              Runtime & Build Logs
            </CardTitle>
            <CardDescription>Live output from GET /api/bots/{botId}/logs</CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRefreshLogs}
            disabled={actionLoading === "logs"}
          >
            <RefreshCw
              className={`h-4 w-4 ${actionLoading === "logs" ? "animate-spin" : ""}`}
            />
            Refresh Logs
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
            {logs || "No log output."}
          </pre>
        </CardContent>
      </Card>

      {/* Environment Variables Editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Environment Variables
            </CardTitle>
            <CardDescription>
              Manage runtime configuration via GET/PUT /api/bots/{botId}/vars
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEnvRows((prev) => [...prev, { key: "", value: "" }])}
          >
            <Plus className="h-4 w-4" />
            Add Variable
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {envRows.map((row, idx) => (
            <div key={idx} className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="KEY"
                className="font-mono text-xs sm:w-1/3"
                value={row.key}
                onChange={(e) => {
                  const next = [...envRows];
                  next[idx].key = e.target.value;
                  setEnvRows(next);
                }}
              />
              <Input
                placeholder="VALUE"
                className="font-mono text-xs sm:flex-1"
                value={row.value}
                onChange={(e) => {
                  const next = [...envRows];
                  next[idx].value = e.target.value;
                  setEnvRows(next);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  setEnvRows((prev) =>
                    prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ key: "", value: "" }]
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveVars}
              disabled={actionLoading === "vars"}
            >
              <Save className="h-4 w-4" />
              {actionLoading === "vars" ? "Saving..." : "Save Variables"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recovery-Authorized Deletion (Admin Only) */}
      {user?.role === "admin" ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Recovery Deletion (Admin)</CardTitle>
            <CardDescription>
              Deletes this bot through an authorized recovery workflow (DELETE /api/bots/:id).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Reason for recovery deletion..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmAction("delete")}
              disabled={actionLoading !== null}
            >
              <Trash2 className="h-4 w-4" />
              Delete via Recovery
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        destructive={confirmAction === "delete" || confirmAction === "stop"}
        loading={actionLoading !== null}
        title={
          confirmAction === "stop"
            ? "Stop Bot"
            : confirmAction === "restart"
              ? "Restart Bot"
              : confirmAction === "extend"
                ? "Confirm Paid Extension"
                : "Confirm Recovery Deletion"
        }
        description={
          confirmAction === "extend"
            ? `Extend "${bot.app_name}" by ${extendDays} days (${
                selectedTier ? `${selectedTier.price_xd} XD` : "live pricing"
              })?`
            : confirmAction === "delete"
              ? `Permanently delete "${bot.app_name}" via the authorized recovery workflow?`
              : `Are you sure you want to ${confirmAction} "${bot.app_name}"?`
        }
        confirmLabel={confirmAction === "delete" ? "Delete Bot" : "Confirm"}
        onConfirm={handleConfirmedAction}
      />
    </div>
  );
}

