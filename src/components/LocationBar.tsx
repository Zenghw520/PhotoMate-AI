import { LoaderCircle, MapPin, Pencil } from "lucide-react";
import type { LocationResult } from "@/functions/shared/contracts";
import { compactLocationName, precisionLabel } from "@/src/lib/format";

export function LocationBar({
  location,
  loading = false,
  onChange,
}: {
  location: LocationResult;
  loading?: boolean;
  onChange: () => void;
}) {
  return (
    <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/85 px-3.5 py-2.5 text-xs shadow-sm">
      <span className="flex min-w-0 flex-1 basis-full items-center gap-1.5 sm:basis-auto">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="shrink-0 text-muted-foreground">拍摄位置</span>
        <strong className="min-w-0 truncate font-medium" title={location.name}>
          <span className="sm:hidden">{compactLocationName(location)}</span>
          <span className="hidden sm:inline">{location.name}</span>
        </strong>
        <span className="shrink-0 text-muted-foreground">
          · {precisionLabel(location.precision)}
        </span>
        {loading && (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-primary"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="size-3.5 animate-spin" />更新中
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 font-medium text-primary transition hover:bg-primary/10"
      >
        <Pencil className="size-3.5" />更改
      </button>
    </div>
  );
}
