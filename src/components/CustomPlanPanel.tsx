import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Compass,
  LoaderCircle,
  MapPin,
  ShieldAlert,
  Sparkles,
  Sunrise,
} from "lucide-react";
import type {
  CustomPlan,
  CustomPlansResponse,
  ThemeId,
  TimelineItem,
  TodayResponse,
} from "@/functions/shared/contracts";
import { generateCustomPlans } from "@/src/lib/api";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { describeFailure, type Failure } from "@/src/lib/errors";
import {
  compass,
  formatRange,
  formatTime,
  metric,
} from "@/src/lib/format";
import {
  THEME_LABELS,
  windowGroupLabel,
  type ShootingSpot,
} from "@/src/lib/shooting";
import { addRecord } from "@/src/lib/records";

const IDEAS = [
  "城市夜景与车轨",
  "雨后街道倒影",
  "日出日落风光",
  "海边慢门与礁石",
  "人像逆光与小景深",
  "古建筑与飞檐",
  "街头烟火气",
  "咖啡馆静物",
  "星空与银河",
  "花卉微距",
];

function aiLabel(status: CustomPlansResponse["aiStatus"]) {
  if (status === "SUCCESS") return "DeepSeek 生成";
  if (status === "LIMIT_REACHED") return "规则建议 · AI 额度已用完";
  if (status === "DISABLED") return "规则建议 · AI 未启用";
  return "规则建议 · AI 暂不可用";
}

function PlanFacts({ plan }: { plan: CustomPlan }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
        <Compass className="size-3 text-primary" />
        {compass(plan.solar.azimuth)} {Math.round(plan.solar.azimuth)}° · 高度{" "}
        {plan.solar.elevation.toFixed(1)}°
      </span>
      {plan.weather && (
        <span className="rounded-full bg-muted px-2.5 py-1">
          {plan.weather.condition} · 云量 {metric(plan.weather.cloud, "%")} ·
          降水概率 {metric(plan.weather.precipitationProbability, "%")}
        </span>
      )}
    </div>
  );
}

export function CustomPlanPanel({
  data,
  spot,
  theme,
  slot,
  equipment,
  onSelectSlot,
  onEquipmentChange,
}: {
  data: TodayResponse;
  spot: ShootingSpot;
  theme: ThemeId;
  slot: TimelineItem | null;
  equipment: string;
  onSelectSlot: (slotId: string) => void;
  onEquipmentChange: (equipment: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [preferences, setPreferences] = useState("");
  const [phone, setPhone] = useState("");
  const [camera, setCamera] = useState("");
  const [lens, setLens] = useState("");
  const [result, setResult] = useState<CustomPlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedPlans, setSavedPlans] = useState<Set<string>>(new Set());
  const [lastSubject, setLastSubject] = useState("");
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setResult(null);
    setSavedPlans(new Set());
  }, [
    theme,
    data.date,
    data.location.latitude,
    data.location.longitude,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function composedEquipment() {
    return [
      phone.trim() ? `手机 ${phone.trim()}` : "",
      camera.trim() ? `相机 ${camera.trim()}` : "",
      lens.trim() ? `镜头 ${lens.trim()}` : "",
      equipment.trim() && !phone.trim() && !camera.trim() && !lens.trim()
        ? equipment.trim()
        : "",
    ].filter(Boolean).join(" · ");
  }

  function savePlan(plan: CustomPlan) {
    addRecord({
      kind: "plan",
      date: data.date,
      locationName: data.location.name,
      subject: subject.trim() || plan.title,
      title: plan.title,
      timeWindow: plan.timeWindow,
      arrivalTime: plan.arrivalTime,
      cameraParameters: plan.cameraParameters,
      schedule: plan.schedule,
      solar: plan.solar,
      weather: plan.weather,
      spot: {
        id: spot.id,
        name: spot.name,
        address: spot.address,
        latitude: spot.latitude,
        longitude: spot.longitude,
        source: spot.source,
        mapUrl: spot.mapUrl,
      },
      windowKind: slot?.kind ?? null,
      windowLabel: slot?.label ?? plan.title,
      equipment: composedEquipment() || undefined,
      cameraDirection: plan.cameraDirection,
      exposureStart: plan.exposureStart,
      backup: plan.backup,
      checklist: [
        "确认机位与通行",
        "相机 / 手机电量与存储",
        "镜头布与防雨",
        "三脚架 / 稳定支撑",
        "按曝光起点试拍",
      ],
    });
    setSavedPlans((previous) => new Set(previous).add(plan.slotId));
  }

  async function generate(value: string) {
    const composed = composedEquipment();
    if (composed) onEquipmentChange(composed);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = ++requestRef.current;
    setLoading(true);
    setFailure(null);
    setLastSubject(value);
    try {
      const response = await generateCustomPlans({
        location: data.location,
        theme,
        date: data.date,
        subject: value,
        ...(composed ? { equipment: composed } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(camera.trim() ? { camera: camera.trim() } : {}),
        ...(lens.trim() ? { lens: lens.trim() } : {}),
        ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
        ...(slot ? { slotKind: slot.kind } : {}),
      }, controller.signal);
      if (requestRef.current !== current || controller.signal.aborted) return;
      setResult(response);
    } catch (reason) {
      if (
        reason instanceof DOMException && reason.name === "AbortError"
      ) return;
      if (requestRef.current !== current) return;
      setFailure(describeFailure(reason, "plan"));
    } finally {
      if (requestRef.current === current) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = subject.trim();
    if (value.length < 2) {
      setFailure({
        kind: "input",
        title: "请输入拍摄题材",
        message: "拍摄题材至少需要 2 个字符，已保留当前设备与偏好。",
        retryable: false,
      });
      return;
    }
    await generate(value);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">按题材生成拍摄方案</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              方案沿用当前机位、日期与窗口；到场后按实际机位和天气微调。
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-medium">
              <MapPin className="size-3.5 text-primary" />
              {spot.name}
            </span>
            <span className="text-muted-foreground">
              {data.date} · {THEME_LABELS[theme]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              <Sunrise className="size-3" />
              {windowGroupLabel(slot?.kind ?? null)}
              {slot ? ` · ${formatRange(slot.start, slot.end)}` : " · 自动选择"}
            </span>
          </div>
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">拍摄窗口</span>
            <select
              value={slot?.slotId ?? ""}
              onChange={(event) => onSelectSlot(event.target.value)}
              className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-xs outline-none focus:border-primary/60"
              aria-label="选择拍摄窗口"
            >
              {data.timeline.map((item) => (
                <option key={item.slotId} value={item.slotId}>
                  {item.label} · {formatRange(item.start, item.end)}
                  {item.score === null ? "" : ` · ${Math.round(item.score)}分`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            拍摄题材
          </span>
          <textarea
            value={subject}
            onChange={(event) => setSubject(event.target.value.slice(0, 200))}
            rows={2}
            placeholder="例如：雨后的城市街头骑行、古建筑屋檐与晚霞…"
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
          />
        </label>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">常用题材</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setSubject(idea)}
                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                {idea}
              </button>
            ))}
          </div>
          <p className="mt-2 text-right text-xs text-muted-foreground">
            {subject.length}/200
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              手机（可选）
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value.slice(0, 40))}
              placeholder="例如：iPhone 15 Pro"
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              相机（可选）
            </span>
            <input
              value={camera}
              onChange={(event) => setCamera(event.target.value.slice(0, 60))}
              placeholder="例如：Sony A7 IV"
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              镜头（可选）
            </span>
            <input
              value={lens}
              onChange={(event) => setLens(event.target.value.slice(0, 60))}
              placeholder="例如：24–70mm f/2.8"
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            />
          </label>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          只填手机或只填相机都可以；参数会按设备类型给出可执行的建议。
        </p>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            拍摄偏好（可选）
          </span>
          <input
            value={preferences}
            onChange={(event) =>
              setPreferences(event.target.value.slice(0, 200))}
            placeholder="例如：想拍慢门、避免人多、希望有前景"
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
          />
        </label>

        <button
          type="submit"
          disabled={loading || subject.trim().length < 2}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading
            ? <><LoaderCircle className="size-4 animate-spin" />生成中…</>
            : <><Sparkles className="size-4" />生成拍摄方案</>}
        </button>
        <p className="mt-3 text-xs leading-4 text-muted-foreground">
          当前将结合 {data.date} · {spot.name} ·{" "}
          {windowGroupLabel(slot?.kind ?? null)} 的天气与太阳方位；到场后按实际机位调整。
        </p>
      </form>

      {failure && (
        <ErrorNotice
          failure={failure}
          onRetry={failure.retryable && lastSubject.trim().length >= 2
            ? () => void generate(lastSubject.trim())
            : undefined}
          retryLabel="保留输入重试"
        />
      )}

      {result && (
        <div className="space-y-3">
          <section className="rounded-[var(--radius)] border border-primary/20 bg-primary/[0.05] p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3" />{aiLabel(result.aiStatus)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />{result.date} · {result.location.name}
              </span>
              {result.slotKind && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  <Sunrise className="size-3" />
                  {windowGroupLabel(result.slotKind)}
                </span>
              )}
              {result.equipment && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {result.equipment}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm leading-6">{result.summary}</p>
            <p className="mt-2 rounded-xl bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
              当天天气依据：{result.weatherSummary}
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs leading-4 text-amber-700 dark:text-amber-400">
                {result.warnings.map((warning) => (
                  <li key={warning}>· {warning}</li>
                ))}
              </ul>
            )}
          </section>

          {result.plans.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              所选日期没有适合生成方案的光线窗口。
            </p>
          )}

          {result.plans.map((plan) => (
            <article
              key={plan.slotId}
              className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary">
                    {formatRange(plan.timeWindow.start, plan.timeWindow.end)}
                  </p>
                  <h4 className="mt-1 text-lg font-semibold tracking-tight">
                    {plan.title}
                  </h4>
                  <PlanFacts plan={plan} />
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3 text-primary" />
                    建议 {formatTime(plan.arrivalTime)} 到达，提前完成踩点与构图
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectSlot(plan.slotId)}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium transition ${
                      slot?.slotId === plan.slotId
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CheckCircle2 className="size-3.5" />
                    {slot?.slotId === plan.slotId ? "已选中" : "选中时段"}
                  </button>
                  <button
                    type="button"
                    onClick={() => savePlan(plan)}
                    disabled={savedPlans.has(plan.slotId)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                  >
                    <CheckCircle2 className="size-3.5" />
                    {savedPlans.has(plan.slotId) ? "已保存" : "保存到行程"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Compass className="size-3.5 text-primary" />拍摄方向
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {plan.cameraDirection}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    太阳方位 {Math.round(plan.cameraAzimuth)}°，到场后用罗盘复核。
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Camera className="size-3.5 text-primary" />曝光起点
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6">
                    {plan.exposureStart}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    先按此拍一张，再按直方图微调。
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3.5 text-primary" />题材切入
                  </p>
                  <p className="mt-1 text-sm leading-6">{plan.subjectApproach}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Camera className="size-3.5 text-primary" />构图建议
                  </p>
                  <p className="mt-1 text-sm leading-6">{plan.composition}</p>
                </div>
              </div>

              {plan.backup && (
                <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="size-3.5" />备选方案
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {plan.backup.trigger}：{plan.backup.action}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    备用窗口：{plan.backup.windowLabel}
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-border/70 bg-muted/25 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Camera className="size-3.5 text-primary" />拍摄参数
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["ISO", plan.cameraParameters.iso],
                    ["光圈", plan.cameraParameters.aperture],
                    ["快门", plan.cameraParameters.shutter],
                    ["焦距", plan.cameraParameters.focalLength],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-xs font-medium leading-5">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <details className="pm-details group mt-3 border-t border-border/60 pt-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-primary">
                    光线与更多参数
                    <ChevronDown className="size-3.5 shrink-0 transition group-open:rotate-180" />
                  </summary>
                  <div className="pm-details-body mt-1 space-y-2 text-xs leading-5 text-muted-foreground">
                    <p>光线：{plan.lightAnalysis}</p>
                    <p>范围：{plan.cameraSettings}</p>
                    <p>
                      曝光补偿 {plan.cameraParameters.exposureBias} · 白平衡{" "}
                      {plan.cameraParameters.whiteBalance} · 对焦{" "}
                      {plan.cameraParameters.focusMode}
                    </p>
                  </div>
                </details>
              </div>

              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Clock3 className="size-3.5 text-primary" />建议拍摄流程
                </p>
                <ol className="mt-2 space-y-2.5">
                  {plan.schedule.map((item) => (
                    <li
                      key={`${item.time}-${item.label}`}
                      className="flex gap-3 text-xs leading-5"
                    >
                      <span className="w-12 shrink-0 font-medium tabular-nums text-primary">
                        {formatTime(item.time)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">
                          {" "}· {item.action}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {plan.risks.length > 0 && (
                <p className="mt-4 rounded-xl bg-amber-500/[0.08] p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
                  风险：{plan.risks.join("；")}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
