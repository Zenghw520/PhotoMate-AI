import { useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Compass,
  LoaderCircle,
  MapPin,
  Sparkles,
} from "lucide-react";
import type {
  CustomPlan,
  CustomPlansResponse,
  ThemeId,
  TodayResponse,
} from "@/functions/shared/contracts";
import { generateCustomPlans } from "@/src/lib/api";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { describeFailure, type Failure } from "@/src/lib/errors";
import { compass, formatRange, formatTime, metric } from "@/src/lib/format";
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
        太阳 {compass(plan.solar.azimuth)} {Math.round(plan.solar.azimuth)}° ·
        高度 {plan.solar.elevation.toFixed(1)}°
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
  theme,
  selectedSlotId,
  onSelectSlot,
}: {
  data: TodayResponse;
  theme: ThemeId;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [equipment, setEquipment] = useState("");
  const [preferences, setPreferences] = useState("");
  const [result, setResult] = useState<CustomPlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedPlans, setSavedPlans] = useState<Set<string>>(new Set());

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
    });
    setSavedPlans((previous) => new Set(previous).add(plan.slotId));
  }

  useEffect(() => {
    setResult(null);
  }, [theme, data.date]);

  async function generate(value: string) {
    setLoading(true);
    setFailure(null);
    try {
      const response = await generateCustomPlans({
        location: data.location,
        theme,
        date: data.date,
        subject: value,
        ...(equipment.trim() ? { equipment: equipment.trim() } : {}),
        ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
      });
      setResult(response);
    } catch (reason) {
      setFailure(describeFailure(reason, "plan"));
    } finally {
      setLoading(false);
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
      <form onSubmit={submit} className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">按题材生成拍摄方案</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              输入想拍的内容。AI 会结合所选日期的天气、太阳方位与光线窗口生成方案。
            </p>
          </div>
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
          <p className="text-xs font-medium text-muted-foreground">
            常用题材
          </p>
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              摄影设备（可选）
            </span>
            <input
              value={equipment}
              onChange={(event) => setEquipment(event.target.value.slice(0, 80))}
              list="photomate-equipment"
              placeholder="例如：全画幅 + 24–70mm + 三脚架"
              className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            />
            <datalist id="photomate-equipment">
              <option value="手机" />
              <option value="全画幅相机 + 24–70mm" />
              <option value="微单 + 50mm 定焦" />
              <option value="相机 + 70–200mm 长焦" />
              <option value="无人机" />
              <option value="相机 + 三脚架" />
            </datalist>
          </label>
          <label className="block">
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
        </div>
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
          当前将结合 {data.date} · {data.location.name} 的天气与太阳窗口；到场后按实际机位调整。
        </p>
      </form>

      {failure && (
        <ErrorNotice
          failure={failure}
          onRetry={failure.retryable && subject.trim().length >= 2
            ? () => void generate(subject.trim())
            : undefined}
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
            </div>
            <p className="mt-3 text-sm leading-6">{result.summary}</p>
            <p className="mt-2 rounded-xl bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
              当天天气依据：{result.weatherSummary}
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs leading-4 text-amber-700 dark:text-amber-400">
                {result.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
              </ul>
            )}
          </section>

          {result.plans.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              所选日期没有适合生成方案的光线窗口。
            </p>
          )}

          {result.plans.map((plan) => (
            <article key={plan.slotId} className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
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
                <button
                  type="button"
                  onClick={() => onSelectSlot(plan.slotId)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition ${
                    selectedSlotId === plan.slotId
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CheckCircle2 className="size-3.5" />
                  {selectedSlotId === plan.slotId ? "已选中" : "选中时段"}
                </button>
                <button
                  type="button"
                  onClick={() => savePlan(plan)}
                  disabled={savedPlans.has(plan.slotId)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                >
                  <CheckCircle2 className="size-3.5" />
                  {savedPlans.has(plan.slotId) ? "已保存" : "保存记录"}
                </button>
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
                      <p className="mt-0.5 text-xs font-medium leading-5">{value}</p>
                    </div>
                  ))}
                </div>
                <details className="mt-3 border-t border-border/60 pt-2">
                  <summary className="cursor-pointer text-xs font-medium text-primary">
                    光线与更多参数
                  </summary>
                  <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
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
                    <li key={`${item.time}-${item.label}`} className="flex gap-3 text-xs leading-5">
                      <span className="w-12 shrink-0 font-medium tabular-nums text-primary">
                        {formatTime(item.time)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground"> · {item.action}</span>
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
