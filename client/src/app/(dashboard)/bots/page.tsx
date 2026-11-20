"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, ExternalLink, PlusCircle, RefreshCw, Search } from "lucide-react";
import { listBots } from "@/services/bots.service";
import { ApiClientError } from "@/services/apiClient";
import type { BotRecord } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

export default function BotsListPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBots();
      setBots(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load bots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const filteredBots = useMemo(() => {
    return bots.filter((bot) => {
      const matchesSearch =
        !search.trim() ||
        bot.app_name.toLowerCase().includes(search.toLowerCase()) ||
        (bot.custom_name || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (bot.status || "").toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [bots, search, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bots"
        description="View and manage all bots owned by your account."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadBots} disabled={loading}>
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

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by app or custom name..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["all", "running", "deploying", "stopped", "failed"].map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={statusFilter === status ? "default" : "outline"}
              className="capitalize"
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={loadBots} /> : null}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filteredBots.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={bots.length === 0 ? "No bots deployed yet" : "No matching bots"}
          description={
            bots.length === 0
              ? "Deploy your first BWM XMD bot from live templates and pricing tiers."
              : "Try clearing your search or status filter."
          }
          actionLabel={bots.length === 0 ? "Deploy Your First Bot" : undefined}
          onAction={bots.length === 0 ? () => router.push("/bots/deploy") : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Bot</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Days Left</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBots.map((bot) => (
                    <tr key={bot.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {bot.custom_name || bot.app_name}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {bot.app_name}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={bot.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {bot.template_id ? `${bot.template_id.slice(0, 8)}...` : "Default"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {bot.expires_at
                          ? new Date(bot.expires_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {typeof bot.days_remaining === "number"
                          ? `${bot.days_remaining} days`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/bots/${bot.id}`}>
                            Manage
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

