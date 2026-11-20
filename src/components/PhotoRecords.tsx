import { useEffect, useState } from "react";
import {
  Camera,
  ClipboardList,
  Clock3,
  MapPin,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  clearRecords,
  deleteRecord,
  readRecords,
  subscribeRecords,
  type PhotoRecord,
} from "@/src/lib/records";
import { formatObservedAt } from "@/src/lib/format";

export function PhotoRecords() {
  const [records, setRecords] = useState<PhotoRecord[]>([]);

  useEffect(() => {
    setRecords(readRecords());
    return subscribeRecords(() => setRecords(readRecords()));
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">本地拍摄记录</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              保存生成的拍摄方案与照片分析结果，仅存储文字与参数。
            </p>
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => clearRecords()}
              className="min-h-11 rounded-full bg-muted px-4 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              清空记录
            </button>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          记录保存在当前浏览器 localStorage，更换设备或清理浏览器后会丢失。
        </p>
      </section>

      {records.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
          还没有记录。在拍摄方案中保存方案，或在照片分析结果中保存分析。
        </p>
      )}

      <div className="space-y-3">
        {records.map((record) => (
          <article key={record.id} className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  {record.kind === "plan"
                    ? <><ClipboardList className="size-3.5" />拍摄方案</>
                    : <><Camera className="size-3.5" />照片分析</>}
                  <span className="font-normal text-muted-foreground">
                    {formatObservedAt(record.savedAt)}
                  </span>
                </p>
                <h4 className="mt-1 truncate font-semibold">
                  {record.kind === "plan" ? record.title : record.fileName}
                </h4>
                {record.kind === "plan" && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />{record.locationName}
                    </span>
                    <span>{record.date}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" />
                      {record.timeWindow.start.slice(11, 16)}–{record.timeWindow.end.slice(11, 16)}
                    </span>
                    <span>{record.subject}</span>
                  </p>
                )}
                {record.kind === "analysis" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    题材：{record.sceneLabel} · 依据完整度 {record.confidence}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteRecord(record.id)}
                aria-label="删除记录"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {record.kind === "plan" ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  查看参数与流程
                </summary>
                <div className="mt-2 grid gap-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                  <p>ISO {record.cameraParameters.iso}</p>
                  <p>光圈 {record.cameraParameters.aperture}</p>
                  <p>快门 {record.cameraParameters.shutter}</p>
                  <p>焦距 {record.cameraParameters.focalLength}</p>
                  <p>曝光补偿 {record.cameraParameters.exposureBias}</p>
                  <p>白平衡 {record.cameraParameters.whiteBalance}</p>
                  <p className="sm:col-span-2">对焦 {record.cameraParameters.focusMode}</p>
                  <div className="sm:col-span-2">
                    {record.schedule.map((item) => (
                      <p key={`${item.time}-${item.label}`}>
                        {item.time.slice(11, 16)} {item.label} · {item.action}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            ) : (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  查看分析摘要
                </summary>
                <div className="mt-2 space-y-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
                  <p>{record.summary}</p>
                  {record.issues.length > 0 && (
                    <p>关注：{record.issues.join("；")}</p>
                  )}
                  {record.suggestions.length > 0 && (
                    <p>建议：{record.suggestions.join("；")}</p>
                  )}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
