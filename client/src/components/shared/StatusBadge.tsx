import { Badge, type BadgeProps } from "@/components/ui/badge";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  running: "success",
  active: "success",
  completed: "success",
  success: "success",
  deploying: "default",
  pending: "default",
  stopped: "warning",
  inactive: "warning",
  uncertain: "warning",
  failed: "destructive",
  error: "destructive",
  deleted: "destructive",
};

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = (status || "unknown").toLowerCase();
  const variant = STATUS_VARIANTS[normalized] || "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {normalized}
    </Badge>
  );
}
