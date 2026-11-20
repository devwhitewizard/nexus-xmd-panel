import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconClassName?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
              iconClassName
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

