"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Loader2,
  RotateCcw,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import {
  deployBot,
  getBotPricing,
  getBotTemplates,
  recoverBot,
  type BotBillingResult,
} from "@/services/bots.service";
import { ApiClientError } from "@/services/apiClient";
import {
  deployBotSchema,
  recoverBotSchema,
  type DeployBotFormValues,
  type RecoverBotFormValues,
} from "@/lib/validators/bots.schema";
import type { BotPricingTier, BotTemplate } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardsSkeleton } from "@/components/shared/LoadingSkeleton";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { cn } from "@/lib/utils";

export default function DeployBotPage() {
  const [tab, setTab] = useState<"deploy" | "recover">("deploy");
  const [templates, setTemplates] = useState<BotTemplate[]>([]);
  const [pricing, setPricing] = useState<BotPricingTier[]>([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  const [pendingDeploy, setPendingDeploy] = useState<DeployBotFormValues | null>(null);
  const [pendingRecover, setPendingRecover] = useState<RecoverBotFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BotBillingResult | null>(null);
  const [uncertainWarning, setUncertainWarning] = useState<string | null>(null);

  const deployForm = useForm<DeployBotFormValues>({
    resolver: zodResolver(deployBotSchema),
    defaultValues: {
      app_name: "",
      session_id: "",
      custom_name: "",
      template_id: "",
      days: 0,
    },
  });

  const recoverForm = useForm<RecoverBotFormValues>({
    resolver: zodResolver(recoverBotSchema),
    defaultValues: {
      app_name: "",
      bot_id: "",
      session_id: "",
      custom_name: "",
    },
  });

  const selectedTemplateId = deployForm.watch("template_id");
  const selectedDays = deployForm.watch("days");

  const loadCatalogue = useCallback(async () => {
    setLoadingCatalogue(true);
    setCatalogueError(null);
    try {
      const [templatesData, pricingData] = await Promise.all([
        getBotTemplates(),
        getBotPricing(),
      ]);
      setTemplates(templatesData);
      setPricing(pricingData);
      if (pricingData.length > 0 && !deployForm.getValues("days")) {
        deployForm.setValue("days", pricingData[0].days);
      }
    } catch (err) {
      setCatalogueError(
        err instanceof ApiClientError
          ? err.message
          : "Unable to load live bot templates and pricing"
      );
    } finally {
      setLoadingCatalogue(false);
    }
  }, [deployForm]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  const selectedTier = pricing.find((p) => p.days === selectedDays);

  const handleConfirmDeploy = async () => {
    if (!pendingDeploy) return;
    setSubmitting(true);
    setUncertainWarning(null);
    try {
      const payload = {
        app_name: pendingDeploy.app_name,
        session_id: pendingDeploy.session_id,
        days: pendingDeploy.days,
        ...(pendingDeploy.custom_name ? { custom_name: pendingDeploy.custom_name } : {}),
        ...(pendingDeploy.template_id ? { template_id: pendingDeploy.template_id } : {}),
      };
      const res = await deployBot(payload);
      setResult(res);
      setPendingDeploy(null);
      deployForm.reset();
      toast.success("Bot deployed successfully!");
    } catch (err) {
      setPendingDeploy(null);
      if (err instanceof ApiClientError && err.code === "UNCERTAIN_PAID_OPERATION") {
        setUncertainWarning(
          `${err.message} Do not submit this deployment again until an administrator reconciles the order.`
        );
        toast.warning("Deployment outcome uncertain — check orders before retrying.");
      } else {
        const msg =
          err instanceof ApiClientError ? err.message : "Bot deployment failed";
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRecover = async () => {
    if (!pendingRecover) return;
    setSubmitting(true);
    setUncertainWarning(null);
    try {
      const payload = {
        ...(pendingRecover.app_name ? { app_name: pendingRecover.app_name } : {}),
        ...(pendingRecover.bot_id ? { bot_id: pendingRecover.bot_id } : {}),
        ...(pendingRecover.session_id ? { session_id: pendingRecover.session_id } : {}),
        ...(pendingRecover.custom_name ? { custom_name: pendingRecover.custom_name } : {}),
      };
      const res = await recoverBot(payload);
      setResult(res);
      setPendingRecover(null);
      recoverForm.reset();
      toast.success("Bot recovered successfully!");
    } catch (err) {
      setPendingRecover(null);
      if (err instanceof ApiClientError && err.code === "UNCERTAIN_PAID_OPERATION") {
        setUncertainWarning(
          `${err.message} Do not retry recovery until verified.`
        );
        toast.warning("Recovery outcome uncertain.");
      } else {
        toast.error(err instanceof ApiClientError ? err.message : "Recovery failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deploy & Recover Bot"
        description="Choose a live BWM XMD template and duration, or recover an existing bot application."
      />

      <div className="flex gap-2 border-b border-border pb-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "deploy" ? "default" : "ghost"}
          onClick={() => setTab("deploy")}
        >
          <Rocket className="h-4 w-4" />
          New Deployment
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "recover" ? "default" : "ghost"}
          onClick={() => setTab("recover")}
        >
          <RotateCcw className="h-4 w-4" />
          Recover Existing Bot
        </Button>
      </div>

      {uncertainWarning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Uncertain Paid Operation</p>
            <p className="mt-1">{uncertainWarning}</p>
          </div>
        </div>
      ) : null}

      {result ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-semibold text-foreground">
                  {result.bot.custom_name || result.bot.app_name} is ready
                </p>
                <p className="text-xs text-muted-foreground">
                  App: <span className="font-mono">{result.bot.app_name}</span>
                  {result.billing?.charged_xd !== null
                    ? ` · Charged: ${result.billing.charged_xd} XD`
                    : ""}
                </p>
              </div>
            </div>
            <Button asChild size="sm">
              <Link href={`/bots/${result.bot.id}`}>Open Bot Console</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {tab === "deploy" ? (
        <>
          {catalogueError ? (
            <ErrorBanner message={catalogueError} onRetry={loadCatalogue} />
          ) : null}

          {loadingCatalogue ? (
            <CardsSkeleton count={4} />
          ) : (
            <form
              onSubmit={deployForm.handleSubmit((vals) => setPendingDeploy(vals))}
              className="space-y-6"
            >
              {/* Step 1: Templates */}
              <Card>
                <CardHeader>
                  <CardTitle>1. Select Template (Optional)</CardTitle>
                  <CardDescription>
                    Live templates fetched from BWM XMD. Click a template to select it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((tpl) => {
                      const selected = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() =>
                            deployForm.setValue("template_id", selected ? "" : tpl.id)
                          }
                          className={cn(
                            "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                            selected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                              : "border-border hover:border-primary/40 hover:bg-muted/40"
                          )}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold text-foreground">
                              <Cpu className="h-4 w-4 text-primary" />
                              {tpl.name}
                            </span>
                            {selected ? <Badge>Selected</Badge> : null}
                          </div>
                          {tpl.description ? (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {tpl.description}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tpl.developer ? (
                              <Badge variant="secondary">By {tpl.developer}</Badge>
                            ) : null}
                            {tpl.required_vars?.map((v) => (
                              <Badge key={v} variant="outline" className="font-mono text-[10px]">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Live Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle>2. Select Duration Tier</CardTitle>
                  <CardDescription>
                    Live pricing tiers from BWM XMD (never hardcoded).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {pricing.map((tier) => {
                      const active = selectedDays === tier.days;
                      return (
                        <button
                          key={tier.days}
                          type="button"
                          onClick={() => deployForm.setValue("days", tier.days)}
                          className={cn(
                            "rounded-xl border p-3.5 text-left transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                              : "border-border hover:border-primary/40"
                          )}
                        >
                          <p className="text-xs font-medium text-muted-foreground">
                            {tier.label || `${tier.days} days`}
                          </p>
                          <p className="mt-1 text-lg font-bold text-foreground">
                            {tier.price_xd} XD
                          </p>
                          {tier.local_formatted ? (
                            <p className="text-xs text-muted-foreground">
                              {tier.local_formatted}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {deployForm.formState.errors.days ? (
                    <p className="mt-2 text-xs text-destructive">
                      {deployForm.formState.errors.days.message}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              {/* Step 3: Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>3. Bot Configuration</CardTitle>
                  <CardDescription>
                    Provide your unique app name and WhatsApp session ID.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="app_name">App Name *</Label>
                    <Input
                      id="app_name"
                      placeholder="my-bwm-bot-01"
                      {...deployForm.register("app_name")}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      3–40 characters: lowercase letters, numbers, and hyphens only.
                    </p>
                    {deployForm.formState.errors.app_name ? (
                      <p className="text-xs text-destructive">
                        {deployForm.formState.errors.app_name.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="custom_name">Custom Display Name (Optional)</Label>
                    <Input
                      id="custom_name"
                      placeholder="Customer Support Bot"
                      {...deployForm.register("custom_name")}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="session_id">Session ID *</Label>
                    <Input
                      id="session_id"
                      type="password"
                      placeholder="Paste your BWM session string"
                      {...deployForm.register("session_id")}
                    />
                    {deployForm.formState.errors.session_id ? (
                      <p className="text-xs text-destructive">
                        {deployForm.formState.errors.session_id.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-2 flex justify-end pt-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deploying...
                        </>
                      ) : (
                        <>
                          <Rocket className="h-4 w-4" />
                          Review & Deploy
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recover Existing Bot</CardTitle>
            <CardDescription>
              Recover an existing BWM bot application into your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={recoverForm.handleSubmit((vals) => setPendingRecover(vals))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor="rec_app_name">App Name</Label>
                <Input
                  id="rec_app_name"
                  placeholder="existing-bot-name"
                  {...recoverForm.register("app_name")}
                />
                {recoverForm.formState.errors.app_name ? (
                  <p className="text-xs text-destructive">
                    {recoverForm.formState.errors.app_name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec_bot_id">BWM Bot ID (Optional)</Label>
                <Input
                  id="rec_bot_id"
                  placeholder="bwm-bot-id"
                  {...recoverForm.register("bot_id")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec_session_id">Session ID (Optional)</Label>
                <Input
                  id="rec_session_id"
                  type="password"
                  placeholder="Session ID if needed"
                  {...recoverForm.register("session_id")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec_custom_name">Custom Name (Optional)</Label>
                <Input
                  id="rec_custom_name"
                  placeholder="Recovered Bot"
                  {...recoverForm.register("custom_name")}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={submitting}>
                  <RotateCcw className="h-4 w-4" />
                  Recover Bot
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeploy)}
        onOpenChange={(open) => {
          if (!open) setPendingDeploy(null);
        }}
        title="Confirm Paid Bot Deployment"
        description={
          pendingDeploy
            ? `Deploy "${pendingDeploy.app_name}" for ${pendingDeploy.days} days (${
                selectedTier ? `${selectedTier.price_xd} XD` : "live tier"
              })? Paid operations cannot be automatically retried.`
            : ""
        }
        confirmLabel="Confirm & Deploy"
        loading={submitting}
        onConfirm={handleConfirmDeploy}
      />

      <ConfirmDialog
        open={Boolean(pendingRecover)}
        onOpenChange={(open) => {
          if (!open) setPendingRecover(null);
        }}
        title="Confirm Bot Recovery"
        description="Proceed with recovering this bot application into your account?"
        confirmLabel="Recover Bot"
        loading={submitting}
        onConfirm={handleConfirmRecover}
      />
    </div>
  );
}

