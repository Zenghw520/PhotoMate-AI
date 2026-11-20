import { AlertCircle, RotateCw } from "lucide-react";
import type { Failure } from "@/src/lib/errors";

export function ErrorNotice({
  failure,
  onRetry,
  retryLabel = "重试",
  secondary,
  compact = false,
}: {
  failure: Failure;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: { label: string; onClick: () => void };
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.06] ${
        compact ? "p-3" : "p-4"
      } text-sm`}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{failure.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {failure.message}
        </p>
        {(onRetry || secondary) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-background px-3 text-xs font-medium shadow-sm transition hover:bg-muted"
              >
                <RotateCw className="size-3.5" />{retryLabel}
              </button>
            )}
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium text-primary transition hover:bg-primary/10"
              >
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
