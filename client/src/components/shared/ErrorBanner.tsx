import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

