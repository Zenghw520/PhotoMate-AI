import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Camera,
  CheckCircle2,
  ClipboardList,
  ClipboardCheck,
  Clock3,
  Compass,
  ListChecks,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  clearRecords,
  deleteRecord,
  readRecords,
  subscribeRecords,
  updateRecord,
  type AnalysisRecord,
  type PlanRecord,
  type ShootReview,
} from "@/src/lib/records";
import { formatObservedAt } from "@/src/lib/format";
import { downloadPlanIcs } from "@/src/lib/ics";
import { spotSourceLabel, type SpotSource } from "@/src/lib/shooting";

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PhotoRecords() {
  const [records, setRecords] = useState<ReturnType<typeof readRecords>>([]);

  useEffect(() => {
    setRecords(readRecords());
    return subscribeRecords(() => setRecords(readRecords()));
  }, []);

  const analyses = useMemo(
    () => records.filter((item): item is AnalysisRecord => item.kind === "analysis"),
    [records],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">本地拍摄记录</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              方案、出门清单、日历导出与拍后复盘都保存在当前浏览器。
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
          记录保存在 localStorage，不上传服务器；旧版本保存的记录仍可打开，缺少的字段会显示为未填写。
        </p>
      </section>

      {records.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
          还没有记录。在拍摄方案中保存方案，或在照片分析结果中保存分析。
        </p>
      )}

      <div className="space-y-3">
        {records.map((record) =>
          record.kind === "plan"
            ? (
              <PlanRecordCard
                key={record.id}
                record={record}
                analyses={analyses}
              />
            )
            : (
              <AnalysisRecordCard
                key={record.id}
                record={record}
                plans={records.filter((item): item is PlanRecord =>
                  item.kind === "plan"
                )}
              />
            )
        )}
      </div>
    </div>
  );
}

function PlanRecordCard({
  record,
  analyses,
}: {
  record: PlanRecord;
  analyses: AnalysisRecord[];
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actualWeather, setActualWeather] = useState(
    record.review?.actualWeather ?? "",
  );
  const [actualParams, setActualParams] = useState(
    record.review?.actualParams ?? "",
  );
  const [note, setNote] = useState(record.review?.note ?? "");
  const [analysisId, setAnalysisId] = useState(record.review?.analysisId ?? "");
  const [adjustment, setAdjustment] = useState(
    record.review?.adjustment ?? "",
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [reviewError, setReviewError] = useState("");

  const linked = analyses.find((item) => item.id === analysisId) ?? null;

  function suggest() {
    const parts: string[] = [];
    if (linked) {
      const issue = linked.issues[0];
      const suggestion = linked.suggestions[0];
      if (issue && suggestion) {
        parts.push(`针对「${issue}」，下次${suggestion}。`);
      } else {
        parts.push(`参考「${linked.sceneLabel}」分析，下次按同一构图再拍一组。`);
      }
    }
    if (record.exposureStart) {
      parts.push(`以计划曝光「${record.exposureStart}」为基准，只调整一项参数再对比。`);
    }
    if (actualWeather.trim()) {
      parts.push(`遇到「${actualWeather.trim()}」时，优先保留高光并准备备选窗口。`);
    }
    if (parts.length === 0) {
      parts.push("下次先固定机位与构图，只调整曝光或设备中的一项，拍完对比直方图。");
    }
    setAdjustment(parts.join(" "));
  }

  function saveReview() {
    if (!actualWeather.trim() && !actualParams.trim() && !note.trim() && !adjustment.trim()) {
      setReviewError("至少填写一项实拍信息或一条调整。");
      return;
    }
    const review: ShootReview = {
      createdAt: new Date().toISOString(),
      actualWeather: actualWeather.trim().slice(0, 200),
      actualParams: actualParams.trim().slice(0, 200),
      note: note.trim().slice(0, 400),
      adjustment: (adjustment.trim() || "下次先复现同一构图，再只调整一项参数。").slice(0, 300),
      ...(analysisId ? { analysisId } : {}),
      ...(linked ? { analysisLabel: linked.fileName } : {}),
    };
    updateRecord(record.id, { review });
    if (analysisId) updateRecord(analysisId, { planId: record.id });
    setReviewError("");
    setReviewOpen(false);
  }

  return (
    <article className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <ClipboardList className="size-3.5" />拍摄方案
            <span className="font-normal text-muted-foreground">
              {formatObservedAt(record.savedAt)}
            </span>
          </p>
          <h4 className="mt-1 truncate font-semibold">{record.title}</h4>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />{record.spot?.name ?? record.locationName}
            </span>
            {record.spot && (
              <span className="rounded-full bg-muted px-2 py-0.5">
                {spotSourceLabel((record.spot.source ?? "MANUAL") as SpotSource)}
              </span>
            )}
            <span>{record.date}</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3" />
              {timeOf(record.timeWindow.start)}–{timeOf(record.timeWindow.end)}
            </span>
            {record.windowLabel && <span>{record.windowLabel}</span>}
            <span>{record.subject}</span>
          </p>
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

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="text-muted-foreground">建议到达</p>
          <p className="mt-0.5 font-semibold">{timeOf(record.arrivalTime)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="flex items-center gap-1 text-muted-foreground">
            <Compass className="size-3" />拍摄方向
          </p>
          <p className="mt-0.5 font-semibold">
            {record.cameraDirection ?? "未记录"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => downloadPlanIcs(record)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <CalendarPlus className="size-3.5" />导出 .ics
        </button>
        <button
          type="button"
          onClick={() => setReviewOpen((value) => !value)}
          aria-expanded={reviewOpen}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
        >
          <ClipboardCheck className="size-3.5" />
          {record.review ? "查看 / 更新复盘" : "拍完复盘"}
        </button>
        {record.review && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />已复盘
          </span>
        )}
      </div>

      {record.review && !reviewOpen && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs leading-5">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            下次可尝试
          </p>
          <p className="mt-1 text-muted-foreground">{record.review.adjustment}</p>
          {(record.review.actualWeather || record.review.actualParams) && (
            <p className="mt-1 text-muted-foreground">
              {record.review.actualWeather && `实况：${record.review.actualWeather}。`}
              {record.review.actualParams && `参数：${record.review.actualParams}。`}
            </p>
          )}
          {record.review.analysisLabel && (
            <p className="mt-1 text-muted-foreground">
              关联分析：{record.review.analysisLabel}
            </p>
          )}
        </div>
      )}

      {reviewOpen && (
        <div className="mt-3 rounded-xl border border-border bg-muted/25 p-3">
          <p className="text-xs font-semibold">拍后复盘</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            记录实际天气与参数，关联一张照片分析，生成一条下次可尝试的调整。
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">实际天气</span>
              <input
                value={actualWeather}
                onChange={(event) => setActualWeather(event.target.value.slice(0, 200))}
                placeholder="例如：云量比预报多，日落前 10 分钟转阴"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">实际参数</span>
              <input
                value={actualParams}
                onChange={(event) => setActualParams(event.target.value.slice(0, 200))}
                placeholder="例如：ISO 200 / f8 / 1/60s，手持"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
              />
            </label>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted-foreground">备注</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 400))}
              rows={2}
              placeholder="现场通行、机位变化、构图取舍…"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted-foreground">关联照片分析（可选）</span>
            <select
              value={analysisId}
              onChange={(event) => setAnalysisId(event.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/60"
            >
              <option value="">不关联</option>
              {analyses.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {analysis.fileName} · {analysis.sceneLabel}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={suggest}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles className="size-3.5" />生成调整
            </button>
            <span className="text-xs text-muted-foreground">
              会结合计划参数与所选分析的关注项。
            </span>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted-foreground">下次可尝试</span>
            <textarea
              value={adjustment}
              onChange={(event) => setAdjustment(event.target.value.slice(0, 300))}
              rows={2}
              placeholder="点“生成调整”或直接填写一条具体动作"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
          </label>
          {reviewError && (
            <p className="mt-1 text-xs text-destructive">{reviewError}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveReview}
              className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              保存复盘
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <details className="pm-details mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-medium text-primary">
          查看参数、清单与流程
        </summary>
        <div className="pm-details-body mt-2 space-y-3">
          <div className="grid gap-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
            <p>ISO {record.cameraParameters.iso}</p>
            <p>光圈 {record.cameraParameters.aperture}</p>
            <p>快门 {record.cameraParameters.shutter}</p>
            <p>焦距 {record.cameraParameters.focalLength}</p>
            <p>曝光补偿 {record.cameraParameters.exposureBias}</p>
            <p>白平衡 {record.cameraParameters.whiteBalance}</p>
            <p className="sm:col-span-2">对焦 {record.cameraParameters.focusMode}</p>
            {record.exposureStart && (
              <p className="sm:col-span-2">曝光起点：{record.exposureStart}</p>
            )}
            {record.equipment && (
              <p className="sm:col-span-2">设备：{record.equipment}</p>
            )}
          </div>

          {record.checklist && record.checklist.length > 0 && (
            <div className="rounded-xl border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <ListChecks className="size-3.5 text-primary" />出门清单
              </p>
              <ul className="mt-2 space-y-1.5">
                {record.checklist.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs leading-5">
                      <input
                        type="checkbox"
                        checked={checked.has(index)}
                        onChange={() =>
                          setChecked((previous) => {
                            const next = new Set(previous);
                            next.has(index) ? next.delete(index) : next.add(index);
                            return next;
                          })}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className={checked.has(index) ? "text-muted-foreground line-through" : ""}>
                        {item}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {record.backup && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-5">
              <p className="font-medium text-amber-800 dark:text-amber-300">备选方案</p>
              <p className="mt-1 text-muted-foreground">
                {record.backup.trigger}：{record.backup.action}（{record.backup.windowLabel}）
              </p>
            </div>
          )}

          <div className="rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
            {record.schedule.map((item) => (
              <p key={`${item.time}-${item.label}`}>
                {timeOf(item.time)} {item.label} · {item.action}
              </p>
            ))}
          </div>
        </div>
      </details>
    </article>
  );
}

function AnalysisRecordCard({
  record,
  plans,
}: {
  record: AnalysisRecord;
  plans: PlanRecord[];
}) {
  const linkedPlan = record.planId
    ? plans.find((plan) => plan.id === record.planId)
    : null;
  return (
    <article className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Camera className="size-3.5" />照片分析
            <span className="font-normal text-muted-foreground">
              {formatObservedAt(record.savedAt)}
            </span>
          </p>
          <h4 className="mt-1 truncate font-semibold">{record.fileName}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            题材：{record.sceneLabel} · 依据完整度 {record.confidence}
          </p>
          {linkedPlan && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              <ClipboardCheck className="size-3" />已关联计划：{linkedPlan.title}
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
      <details className="pm-details mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-medium text-primary">
          查看分析摘要
        </summary>
        <div className="pm-details-body mt-2 space-y-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
          <p>{record.summary}</p>
          {record.issues.length > 0 && <p>关注：{record.issues.join("；")}</p>}
          {record.suggestions.length > 0 && <p>建议：{record.suggestions.join("；")}</p>}
        </div>
      </details>
    </article>
  );
}
