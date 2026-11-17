import { AlertCircle } from "lucide-react";

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 border border-destructive/30 bg-destructive/[0.05] p-4 text-sm" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-2 font-medium text-primary hover:underline">重新加载</button>}
      </div>
    </div>
  );
}
