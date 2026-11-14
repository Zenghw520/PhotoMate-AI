import { AlertCircle, Info } from "lucide-react";

export function CapabilityNotice({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-foreground" aria-label="数据状态提示">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      </div>
    </section>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-4 text-sm" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-2 font-medium text-primary hover:underline">重新加载</button>}
      </div>
    </div>
  );
}
