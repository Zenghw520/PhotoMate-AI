import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * 可控展开区：高度使用 grid-template-rows 过渡，展开/收起不再跳变，
 * 收起后内容不可聚焦、不参与无障碍树。
 */
export function Disclosure({
  open,
  onOpenChange,
  label,
  openLabel,
  hint,
  context,
  children,
  className = "",
  panelClassName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  openLabel?: string;
  hint?: string;
  /** 供读屏区分同页多个“查看预测依据”，不会替换可见文案。 */
  context?: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  const reactId = useId();
  const panelId = `pm-disclosure-${reactId.replace(/:/g, "")}`;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{open ? openLabel ?? label : label}</span>
          {context && <span className="sr-only">（{context}）</span>}
          {hint && !open && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition-transform duration-300 ease-out ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={panelClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}
