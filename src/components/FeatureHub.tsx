import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  CloudSun,
  MapPin,
  Sparkles,
  Sunrise,
} from "lucide-react";
import { THEMES } from "@/functions/shared/contracts";
import type {
  LocationResult,
  SlotKind,
  ThemeId,
  TodayResponse,
  WeatherData,
} from "@/functions/shared/contracts";
import {
  formatDate,
  formatObservedAt,
  formatTime,
  themeLabels,
} from "@/src/lib/format";
import { LocationSearch } from "@/src/components/LocationSearch";
import { WeatherOverview } from "@/src/components/WeatherOverview";
import { PotentialCard } from "@/src/components/PotentialCard";
import { FireCloudCard } from "@/src/components/FireCloudCard";
import { SolarTimeline } from "@/src/components/SolarTimeline";
import { PlanPanel } from "@/src/components/PlanPanel";

export type SectionId = "WEATHER" | "LIGHT" | "PLANS";

const SECTION_META: Record<
  SectionId,
  { title: string; intro: string; icon: typeof CloudSun }
> = {
  WEATHER: {
    title: "实况天气",
    intro: "查看真实温度、云量、降水、风、能见度和空气质量，并核对数据来源与缺失字段。",
    icon: CloudSun,
  },
  LIGHT: {
    title: "霞光与光线",
    intro: "选择拍摄位置和日期后，用真实云量、降水与太阳位置评估朝霞、晚霞，并列出当天光线窗口。",
    icon: Sunrise,
  },
  PLANS: {
    title: "拍摄方案",
    intro: "结合摄影主题给出时间、方向、机位、构图和参数建议，AI 只优化表达，不改动事实。",
    icon: Sparkles,
  },
};

const SECTION_ORDER: SectionId[] = ["WEATHER", "LIGHT", "PLANS"];

const TABS: Record<SectionId, { id: string; label: string; intro: string }[]> = {
  WEATHER: [
    {
      id: "current",
      label: "实况与逐小时",
      intro: "当前观测与未来逐小时变化均来自真实天气服务。",
    },
    {
      id: "sources",
      label: "来源与完整性",
      intro: "核对数据来源、观测时间与缺失字段，缺失时不会补造数值。",
    },
  ],
  LIGHT: [
    {
      id: "dawn",
      label: "朝霞",
      intro: "日出前窗口的霞光环境评分，附评价依据和置信度。",
    },
    {
      id: "dusk",
      label: "晚霞",
      intro: "日落前后窗口的霞光环境评分，附评价依据和置信度。",
    },
    {
      id: "firecloud",
      label: "火烧云",
      intro:
        "用总云量、降水、湿度与太阳窗口评估火烧云环境潜力；缺少云层分层和气溶胶数据，置信度受限。",
    },
    {
      id: "timeline",
      label: "时间轴",
      intro: "按太阳高度角查看全天光线窗口，可继续筛选清晨、傍晚和夜间。",
    },
  ],
  PLANS: [
    {
      id: "plans",
      label: "推荐方案",
      intro: "选择主题与推荐时段，查看方向、构图和参数建议。",
    },
    {
      id: "themes",
      label: "主题指南",
      intro: "七种摄影主题的关注重点，选择后回到推荐方案。",
    },
  ],
};

const PERIODS: { id: string; label: string; kinds: SlotKind[] | null }[] = [
  { id: "all", label: "全部", kinds: null },
  {
    id: "morning",
    label: "清晨",
    kinds: ["DAWN", "SUNRISE", "MORNING_GOLDEN"],
  },
  {
    id: "evening",
    label: "傍晚",
    kinds: ["EVENING_GOLDEN", "SUNSET", "DUSK"],
  },
  { id: "night", label: "夜间", kinds: ["BLUE_HOUR", "NIGHT"] },
];

const DAY_OPTIONS = [
  { offset: 0, label: "今天" },
  { offset: 1, label: "明天" },
  { offset: 2, label: "后天" },
];

const WEATHER_STATUS: Record<WeatherData["status"], string> = {
  OK: "实时",
  STALE: "短时缓存",
  UNCONFIGURED: "未配置",
  UNAVAILABLE: "暂不可用",
};

const THEME_INTROS: Record<ThemeId, string> = {
  PORTRAIT: "关注人物与光线的距离、背景简洁度和肤色表现。",
  LANDSCAPE: "关注天空层次、云量与远景通透度，安排前中远景。",
  ARCHITECTURE: "关注线条、透视与立面受光，比较正面和斜侧面。",
  STREET: "关注街道延伸、行人节奏和明暗边界，尊重隐私与通行。",
  FOOD: "关注侧光、背景整洁和色彩还原，确认经营方要求。",
  NIGHT: "关注环境光层次、暗部细节和稳定支撑条件。",
  TRAVEL: "关注环境交代与行程可达性，不预设专属机位。",
};

interface FeatureHubProps {
  data: TodayResponse | null;
  location: LocationResult | null;
  section: SectionId | null;
  theme: ThemeId;
  selectedSlotId: string | null;
  dayOffset: number;
  targetDate: string;
  onDayChange: (offset: number) => void;
  onSectionChange: (section: SectionId | null) => void;
  onSelectLocation: (location: LocationResult) => void;
  onThemeChange: (theme: ThemeId) => void;
  onSelectSlot: (slotId: string) => void;
}

export function FeatureHub({
  data,
  location,
  section,
  theme,
  selectedSlotId,
  dayOffset,
  targetDate,
  onDayChange,
  onSectionChange,
  onSelectLocation,
  onThemeChange,
  onSelectSlot,
}: FeatureHubProps) {
  if (section === null) {
    return (
      <FeatureMenu
        data={data}
        location={location}
        dayOffset={dayOffset}
        onSectionChange={onSectionChange}
      />
    );
  }
  return (
    <SectionDetail
      key={section}
      data={data}
      location={location}
      section={section}
      theme={theme}
      selectedSlotId={selectedSlotId}
      dayOffset={dayOffset}
      targetDate={targetDate}
      onDayChange={onDayChange}
      onSectionChange={onSectionChange}
      onSelectLocation={onSelectLocation}
      onThemeChange={onThemeChange}
      onSelectSlot={onSelectSlot}
    />
  );
}

function FeatureMenu({
  data,
  location,
  dayOffset,
  onSectionChange,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  dayOffset: number;
  onSectionChange: (section: SectionId) => void;
}) {
  const weather = data?.weather.current;
  const dayLabel = DAY_OPTIONS.find((item) => item.offset === dayOffset)
    ?.label ?? "今天";
  const summaries: Record<SectionId, string> = {
    WEATHER: data
      ? weather
        ? `${Math.round(weather.temperature ?? 0)}° · ${
          weather.condition || "天气未知"
        }`
        : WEATHER_STATUS[data.weather.status]
      : "先选择拍摄位置",
    LIGHT: data
      ? `${dayLabel} · 朝 ${scoreText(data.potential.dawn.score)} · 晚 ${
        scoreText(data.potential.dusk.score)
      }`
      : location
      ? "正在获取环境数据"
      : "进入选择拍摄位置",
    PLANS: data
      ? `${data.plans.items.length} 个推荐时段`
      : "先选择拍摄位置",
  };

  return (
    <section className="mt-6" aria-labelledby="feature-menu-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="feature-menu-title"
            className="text-lg font-semibold tracking-tight"
          >
            功能导航
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            天气、霞光与光线、拍摄方案分开展示。点击卡片进入对应功能。
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTION_ORDER.map((id) => {
          const meta = SECTION_META[id];
          const Icon = meta.icon;
          const needsLocation = !location && id !== "LIGHT";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(needsLocation ? "LIGHT" : id)}
              className="group flex min-h-44 flex-col rounded-[var(--radius)] border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{meta.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {meta.intro}
              </p>
              <p className="mt-auto pt-4 text-xs font-medium text-primary">
                {summaries[id]}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SectionDetail({
  data,
  location,
  section,
  theme,
  selectedSlotId,
  dayOffset,
  targetDate,
  onDayChange,
  onSectionChange,
  onSelectLocation,
  onThemeChange,
  onSelectSlot,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  section: SectionId;
  theme: ThemeId;
  selectedSlotId: string | null;
  dayOffset: number;
  targetDate: string;
  onDayChange: (offset: number) => void;
  onSectionChange: (section: SectionId | null) => void;
  onSelectLocation: (location: LocationResult) => void;
  onThemeChange: (theme: ThemeId) => void;
  onSelectSlot: (slotId: string) => void;
}) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  const tabs = TABS[section];
  const [tab, setTab] = useState(tabs[0].id);
  const [period, setPeriod] = useState("all");
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const periodKinds = PERIODS.find((item) => item.id === period)?.kinds ?? null;
  const filteredTimeline = data && periodKinds
    ? data.timeline.filter((item) => periodKinds.includes(item.kind))
    : data?.timeline ?? [];

  return (
    <section className="mt-6" aria-labelledby="section-title">
      <button
        type="button"
        onClick={() => onSectionChange(null)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />返回功能导航
      </button>

      <div className="mt-2 flex items-start gap-4 rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h2
            id="section-title"
            className="text-lg font-semibold tracking-tight"
          >
            {meta.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {meta.intro}
          </p>
        </div>
      </div>

      {section === "LIGHT" && (
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
          <LocationSearch location={location} onSelect={onSelectLocation} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <div
              role="group"
              aria-label="查询日期"
              className="flex gap-2"
            >
              {DAY_OPTIONS.map((item) => (
                <button
                  key={item.offset}
                  type="button"
                  aria-pressed={dayOffset === item.offset}
                  onClick={() => onDayChange(item.offset)}
                  className={`min-h-10 rounded-full px-3.5 text-xs font-medium transition ${
                    dayOffset === item.offset
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(targetDate)}
            </span>
          </div>
        </div>
      )}

      {!data && section !== "LIGHT" && (
        <LocationPrompt onGo={() => onSectionChange("LIGHT")} />
      )}

      {!data && section === "LIGHT" && (
        <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border bg-card/60 p-5 text-sm leading-6 text-muted-foreground">
          {location
            ? "位置已确定，正在获取真实环境并生成霞光评分与光线时间轴。"
            : "请搜索城市或区县，或使用 GPS、手动坐标确定拍摄位置。选择后将生成朝霞、晚霞评分与光线时间轴。"}
        </div>
      )}

      {data && (
        <>
          <div
            role="tablist"
            aria-label={`${meta.title}二级菜单`}
            className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                  tab === item.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {activeTab.intro}
          </p>

          <div className="mt-4">
            {section === "WEATHER" && tab === "current" && (
              <WeatherOverview weather={data.weather} />
            )}
            {section === "WEATHER" && tab === "sources" && (
              <WeatherSources weather={data.weather} />
            )}
            {section === "LIGHT" && tab === "dawn" && (
              <PotentialCard type="dawn" data={data.potential.dawn} />
            )}
            {section === "LIGHT" && tab === "dusk" && (
              <PotentialCard type="dusk" data={data.potential.dusk} />
            )}
            {section === "LIGHT" && tab === "firecloud" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FireCloudCard type="dawn" data={data.fireCloud.dawn} />
                  <FireCloudCard type="dusk" data={data.fireCloud.dusk} />
                </div>
                <p className="mt-3 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
                  预测思路参考公开火烧云研究：中高云适量、低云不挡光、空气通透时更有利。当前数据缺少高中低云分层与气溶胶，分数仅表示环境潜力，不是出现概率，也不能替代卫星云图与现场判断。
                </p>
              </>
            )}
            {section === "LIGHT" && tab === "timeline" && (
              <>
                <div
                  role="group"
                  aria-label="时段筛选"
                  className="scrollbar-none mb-3 flex gap-2 overflow-x-auto pb-1"
                >
                  {PERIODS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={period === item.id}
                      onClick={() => setPeriod(item.id)}
                      className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
                        period === item.id
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <SolarTimeline
                  solar={data.solar}
                  timeline={filteredTimeline}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={onSelectSlot}
                />
              </>
            )}
            {section === "PLANS" && tab === "plans" && (
              <PlanPanel
                data={data}
                theme={theme}
                onThemeChange={onThemeChange}
                selectedSlotId={selectedSlotId}
                onSelectSlot={onSelectSlot}
              />
            )}
            {section === "PLANS" && tab === "themes" && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {THEMES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      onThemeChange(item);
                      setTab("plans");
                    }}
                    className={`rounded-[var(--radius)] border p-4 text-left transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 ${
                      theme === item
                        ? "border-primary/40 bg-primary/[0.07]"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-medium">{themeLabels[item]}</span>
                      {theme === item && (
                        <Camera className="size-4 text-primary" />
                      )}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                      {THEME_INTROS[item]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LocationPrompt({ onGo }: { onGo: () => void }) {
  return (
    <div className="mt-4 grid min-h-52 place-items-center rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <MapPin className="mx-auto size-8 text-primary" />
        <h3 className="mt-3 text-lg font-semibold">先确定拍摄位置</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          位置选择只在「霞光与光线」中使用。确定位置后，天气和拍摄方案会自动沿用该位置。
        </p>
        <button
          type="button"
          onClick={onGo}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          去选择拍摄位置
        </button>
      </div>
    </div>
  );
}

function WeatherSources({ weather }: { weather: WeatherData }) {
  const multiSource = weather.sources.includes("和风天气") &&
    weather.sources.includes("OpenWeather");
  const observedAt = weather.current
    ? formatObservedAt(weather.current.observedAt)
    : "暂无观测时间";
  const rows = [
    { label: "数据状态", value: WEATHER_STATUS[weather.status] },
    {
      label: "数据来源",
      value: weather.sources.join(" / ") || "未提供",
    },
    { label: "观测时间", value: observedAt },
    {
      label: "缺失字段",
      value: weather.missingFields.join("、") || "无",
    },
    { label: "说明", value: weather.message ?? "当前没有额外说明。" },
  ];
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">来源与完整性</h3>
      <dl className="mt-4 divide-y divide-border/70">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 py-3 text-sm sm:grid-cols-[8rem_1fr] sm:gap-3"
          >
            <dt className="text-xs font-medium text-muted-foreground">
              {row.label}
            </dt>
            <dd className="leading-6">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        天气与空气质量必须来自真实服务。未配置或缺失时，页面会明确标注并暂停相关评分，不会用推测值补齐。
      </p>
      {multiSource && (
        <p className="mt-2 rounded-xl bg-primary/[0.06] p-3 text-xs leading-5 text-muted-foreground">
          数值字段由和风天气与 OpenWeather 等权平均；天气现象文字优先采用和风天气，空气质量来自和风天气。单一来源缺失的字段按可用来源计算。
        </p>
      )}
    </section>
  );
}

function scoreText(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}
