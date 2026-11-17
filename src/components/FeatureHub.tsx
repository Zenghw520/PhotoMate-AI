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
  formatRange,
  summarizeMissingFields,
} from "@/src/lib/format";
import { WeatherOverview } from "@/src/components/WeatherOverview";
import { PhotoIndices } from "@/src/components/PhotoIndices";
import { SpotRecommendations } from "@/src/components/SpotRecommendations";
import { PotentialCard } from "@/src/components/PotentialCard";
import { FireCloudCard } from "@/src/components/FireCloudCard";
import { SolarTimeline } from "@/src/components/SolarTimeline";
import { SolarPath } from "@/src/components/SolarPath";
import { PhotoAnalysis, PhotoMethod } from "@/src/components/PhotoAnalysis";
import { PhotoRecords } from "@/src/components/PhotoRecords";
import { CustomPlanPanel } from "@/src/components/CustomPlanPanel";

export type SectionId = "WEATHER" | "LIGHT" | "PLANS" | "SPOTS" | "PHOTO";

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
    intro: "在主界面选择拍摄位置，再用日期切换查看朝霞、晚霞、火烧云与全天光线窗口。",
    icon: Sunrise,
  },
  PLANS: {
    title: "拍摄方案",
    intro: "自定义题材，结合当天真实天气与太阳窗口，生成时间、方向、构图和参数建议。",
    icon: Sparkles,
  },
  SPOTS: {
    title: "地点推荐",
    intro:
      "按题材检索周边高德摄影点，结合日出日落方位给出建议窗口与方向；地形遮挡仍需现场确认。",
    icon: MapPin,
  },
  PHOTO: {
    title: "照片分析",
    intro: "上传照片，先根据画面特征推断题材，再结合 EXIF 与画质统计给出针对性建议；原始照片不上传。",
    icon: Camera,
  },
};

const SECTION_ORDER: SectionId[] = [
  "WEATHER",
  "LIGHT",
  "PLANS",
  "SPOTS",
  "PHOTO",
];

const TABS: Record<SectionId, { id: string; label: string; intro: string }[]> = {
  WEATHER: [
    {
      id: "current",
      label: "实况与逐小时",
      intro: "当前观测与未来逐小时变化均来自真实天气服务。",
    },
    {
      id: "indices",
      label: "摄影指数",
      intro:
        "综合与分题材摄影指数、全天评分趋势；每个指数都由当天真实天气和天文窗口计算。",
    },
    {
      id: "sources",
      label: "来源与完整性",
      intro: "核对数据来源、观测时间与缺失字段，缺失时不会补造数值。",
    },
  ],
  LIGHT: [
    {
      id: "glow",
      label: "霞光与火烧云",
      intro:
        "朝霞、晚霞与火烧云合并在同一页；火烧云可能性与鲜艳度依据窗口附近的真实总云量、能见度与湿度判断。",
    },
    {
      id: "solar",
      label: "太阳轨迹",
      intro:
        "拖动时间轴查看太阳全天轨迹、方位角与高度角，并核对晨昏蒙影、黄金与蓝调时刻。",
    },
    {
      id: "timeline",
      label: "时间轴",
      intro: "按太阳高度角查看全天光线窗口，可继续筛选清晨、傍晚和夜间。",
    },
  ],
  PLANS: [
    {
      id: "custom",
      label: "自定义题材",
      intro: "每个方案都标注太阳方位、高度和对应时段的真实天气，便于现场核对。",
    },
  ],
  SPOTS: [
    {
      id: "spots",
      label: "摄影点推荐",
      intro:
        "按题材检索高德 POI，并结合当天日出日落方位给出建议窗口；不包含地形遮挡与开放状态。",
    },
  ],
  PHOTO: [
    {
      id: "upload",
      label: "上传分析",
      intro: "先在本地推断题材，再结合 EXIF 与画质统计，生成贴合题材的技术建议。",
    },
    {
      id: "records",
      label: "拍摄记录",
      intro: "查看保存在当前浏览器的拍摄方案与分析记录；原始照片不会上传。",
    },
    {
      id: "method",
      label: "分析依据",
      intro: "了解题材推断、EXIF 与画质指标的含义与边界，以及照片隐私处理方式。",
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

interface FeatureHubProps {
  data: TodayResponse | null;
  location: LocationResult | null;
  section: SectionId | null;
  direction: "forward" | "back";
  theme: ThemeId;
  selectedSlotId: string | null;
  dayOffset: number;
  targetDate: string;
  onDayChange: (offset: number) => void;
  onSectionChange: (section: SectionId | null) => void;
  onNeedLocation: () => void;
  onSelectSlot: (slotId: string) => void;
}

export function FeatureHub({
  data,
  location,
  section,
  direction,
  theme,
  selectedSlotId,
  dayOffset,
  targetDate,
  onDayChange,
  onSectionChange,
  onNeedLocation,
  onSelectSlot,
}: FeatureHubProps) {
  if (section === null) {
    return (
      <div className={direction === "back" ? "pm-view-back" : "pm-view"}>
        <FeatureMenu
          data={data}
          location={location}
          dayOffset={dayOffset}
          onSectionChange={onSectionChange}
          onNeedLocation={onNeedLocation}
        />
      </div>
    );
  }
  return (
    <div className="pm-view-forward">
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
        onSelectSlot={onSelectSlot}
      />
    </div>
  );
}

function FeatureMenu({
  data,
  location,
  dayOffset,
  onSectionChange,
  onNeedLocation,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  dayOffset: number;
  onSectionChange: (section: SectionId) => void;
  onNeedLocation: () => void;
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
    PLANS: data ? `${dayLabel} · 按题材生成` : "先选择拍摄位置",
    SPOTS: location
      ? `${dayLabel} · 周边摄影点`
      : "先选择拍摄位置",
    PHOTO: "题材推断 + EXIF + 画质统计",
  };

  return (
    <section className="mt-6" aria-labelledby="feature-menu-title">
      {data && <TodayOverview data={data} />}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="feature-menu-title"
            className="text-lg font-semibold tracking-tight 2xl:text-xl"
          >
            功能导航
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground 2xl:text-sm">
            天气、霞光与光线、拍摄方案、照片分析分开展示。点击卡片进入对应功能。
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:mt-4 2xl:grid-cols-5 2xl:gap-4">
        {SECTION_ORDER.map((id) => {
          const meta = SECTION_META[id];
          const Icon = meta.icon;
          const needsLocation = !location && id !== "LIGHT" && id !== "PHOTO";
          return (
            <button
              key={id}
              type="button"
              onClick={() =>
                needsLocation ? onNeedLocation() : onSectionChange(id)}
              className="group flex min-h-44 flex-col rounded-[var(--radius)] border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 2xl:min-h-48 2xl:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary 2xl:size-12">
                  <Icon className="size-5 2xl:size-6" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary 2xl:size-5" />
              </div>
              <h3 className="mt-4 font-semibold 2xl:text-lg">{meta.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground 2xl:text-sm 2xl:leading-6">
                {meta.intro}
              </p>
              <p className="mt-auto pt-4 text-xs font-medium text-primary 2xl:text-sm">
                {summaries[id]}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TodayOverview({ data }: { data: TodayResponse }) {
  const current = data.weather.current;
  const upcoming = data.timeline
    .filter((item) => !item.isPast && item.score !== null)
    .slice(0, 4);
  const best = [...upcoming].sort((left, right) =>
    (right.score ?? 0) - (left.score ?? 0)
  )[0] ?? null;
  const overall = data.indices.overall;
  const confidence = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" }[
    data.indices.confidence
  ];
  return (
    <div className="mb-5 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">今日摄影概览</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(data.date)} · {data.location.name} · {confidence}置信度
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          由真实天气与本地天文计算
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-muted/45 p-3">
          <p className="text-[11px] text-muted-foreground">综合摄影指数</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {overall === null ? "—" : Math.round(overall)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / 100
            </span>
          </p>
        </div>
        <div className="rounded-xl bg-muted/45 p-3">
          <p className="text-[11px] text-muted-foreground">朝霞 / 晚霞</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {scoreText(data.potential.dawn.score)}
            <span className="mx-1 text-sm font-normal text-muted-foreground">
              /
            </span>
            {scoreText(data.potential.dusk.score)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/45 p-3">
          <p className="text-[11px] text-muted-foreground">下一最佳窗口</p>
          {best ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold">{best.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatRange(best.start, best.end)} ·{" "}
                {scoreText(best.score)} 分
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold">今日窗口已结束</p>
          )}
        </div>
        <div className="rounded-xl bg-muted/45 p-3">
          <p className="text-[11px] text-muted-foreground">实况天气</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {current?.temperature === null || current === null
              ? "—"
              : `${Math.round(current.temperature)}°`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {current
              ? `${current.condition || "天气未知"} · 云量 ${
                current.cloud === null ? "—" : `${Math.round(current.cloud)}%`
              }`
              : WEATHER_STATUS[data.weather.status]}
          </p>
        </div>
      </div>
    </div>
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
  const tabBar = (
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
  );

  return (
    <section className="mt-6" aria-labelledby="section-title">
      <button
        type="button"
        onClick={() => onSectionChange(null)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />返回功能导航
      </button>

      <div className="mt-2 flex items-start gap-4 rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm 2xl:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary 2xl:size-12">
          <Icon className="size-5 2xl:size-6" />
        </span>
        <div>
          <h2
            id="section-title"
            className="text-lg font-semibold tracking-tight 2xl:text-xl"
          >
            {meta.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground 2xl:text-base 2xl:leading-7">
            {meta.intro}
          </p>
        </div>
      </div>

      {section === "LIGHT" && (
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
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

      {section === "SPOTS" && (
        location
          ? (
            <div className="mt-4">
              <SpotRecommendations
                location={location}
                date={targetDate}
                dayOffset={dayOffset}
                onDayChange={onDayChange}
              />
            </div>
          )
          : <LocationPrompt />
      )}

      {!data && section !== "LIGHT" && section !== "PHOTO" &&
        section !== "SPOTS" && (
        <LocationPrompt />
      )}

      {!data && section === "LIGHT" && (
        <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border bg-card/60 p-5 text-sm leading-6 text-muted-foreground">
          {location
            ? "位置已确定，正在获取真实环境并生成霞光评分与光线时间轴。"
            : "请先在主页面选择拍摄位置，再查看当天的霞光评分与光线时间轴。"}
        </div>
      )}

      {section === "PHOTO" && (
        <>
          {tabBar}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {activeTab.intro}
          </p>
          <div className="mt-4">
            {tab === "upload"
              ? <PhotoAnalysis />
              : tab === "records"
              ? <PhotoRecords />
              : <PhotoMethod />}
          </div>
        </>
      )}

      {section !== "PHOTO" && section !== "SPOTS" && data && (
        <>
          {tabs.length > 1 && tabBar}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {activeTab.intro}
          </p>

          <div className="mt-4">
            {section === "WEATHER" && tab === "current" && (
              <WeatherOverview
                weather={data.weather}
                targetDate={targetDate}
                alerts={data.alerts}
              />
            )}
            {section === "WEATHER" && tab === "indices" && (
              <PhotoIndices
                indices={data.indices}
                forecastUpdatedAt={data.weather.forecastUpdatedAt}
                sources={data.weather.sources}
              />
            )}
            {section === "WEATHER" && tab === "sources" && (
              <WeatherSources weather={data.weather} />
            )}
            {section === "LIGHT" && tab === "glow" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
                  <span>
                    实况观测于{" "}
                    {data.weather.current
                      ? formatObservedAt(data.weather.current.observedAt)
                      : "暂不可用"}
                  </span>
                  <span>
                    预报获取于{" "}
                    {data.weather.forecastUpdatedAt
                      ? formatObservedAt(data.weather.forecastUpdatedAt)
                      : "未提供"}{" "}
                    · 来源 {data.weather.sources.join(" / ") || "未提供"}
                  </span>
                </div>
                {(["dawn", "dusk"] as const).map((type) => {
                  const context = solarEventContext(data.solar, type);
                  return (
                    <div key={type}>
                      <h3 className="text-sm font-semibold">
                        {type === "dawn" ? "朝霞" : "晚霞"}
                      </h3>
                      <div className="mt-3 grid gap-4 xl:grid-cols-2">
                        <PotentialCard
                          type={type}
                          data={data.potential[type]}
                          eventTime={context.eventTime}
                          azimuth={context.azimuth}
                          elevation={context.elevation}
                        />
                        <FireCloudCard
                          type={type}
                          data={data.fireCloud[type]}
                          eventTime={context.eventTime}
                          azimuth={context.azimuth}
                          elevation={context.elevation}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
                  预测思路参考公开火烧云研究：中高云适量、低云不挡光、空气通透时更有利。可能性与鲜艳度依据窗口云量、高/中/低云分层与气溶胶数据判断，仍只表示环境条件，不能替代卫星云图与现场判断。
                </p>
              </div>
            )}
            {section === "LIGHT" && tab === "solar" && (
              <SolarPath
                solar={data.solar}
                date={targetDate}
                location={location}
              />
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
            {section === "PLANS" && (
              <CustomPlanPanel
                data={data}
                theme={theme}
                selectedSlotId={selectedSlotId}
                onSelectSlot={onSelectSlot}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LocationPrompt() {
  return (
    <div className="mt-4 grid min-h-52 place-items-center rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <MapPin className="mx-auto size-8 text-primary" />
        <h3 className="mt-3 text-lg font-semibold">先确定拍摄位置</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          请先在主页面选择拍摄位置，天气和拍摄方案会自动沿用该位置。
        </p>
      </div>
    </div>
  );
}

function WeatherSources({ weather }: { weather: WeatherData }) {
  const multiSource = weather.sources.length >= 2;
  const observedAt = weather.current
    ? formatObservedAt(weather.current.observedAt)
    : "暂无观测时间";
  const forecastUpdated = weather.forecastUpdatedAt
    ? formatObservedAt(weather.forecastUpdatedAt)
    : "未提供";
  const nowHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const futureHours = weather.hourly.filter((entry) =>
    Date.parse(entry.time) >= nowHour
  );
  const firstHour = futureHours[0]?.time;
  const lastHour = futureHours.at(-1)?.time;
  const coverage = firstHour && lastHour
    ? `${formatObservedAt(firstHour)} 至 ${
      formatObservedAt(lastHour)
    }（${futureHours.length} 条未来逐小时数据）`
    : "无未来逐小时数据";
  const rows = [
    { label: "数据状态", value: WEATHER_STATUS[weather.status] },
    {
      label: "实况观测",
      value: `${observedAt} · 当前天气为站点观测/实况数据`,
    },
    {
      label: "逐小时预报",
      value: `获取于 ${forecastUpdated} · 覆盖 ${coverage}`,
    },
    {
      label: "数据来源",
      value: weather.sources.join(" / ") || "未提供",
    },
    {
      label: "两类数据",
      value:
        "实况只用于“此刻天气”；逐小时预报用于趋势、霞光、摄影指数与提醒，页面分别标注观测时间和获取时间。",
    },
    {
      label: "缺失字段",
      value: summarizeMissingFields(weather.missingFields).join("、") || "无",
    },
    {
      label: "说明",
      value: weather.message ?? "当前没有额外说明。",
    },
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
      {weather.status === "STALE" && (
        <p className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-5 text-muted-foreground">
          当前为短时真实缓存，观测与预报时间保持不变；评分置信度已按数据时效降低。
        </p>
      )}
      {weather.missingFields.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <p className="text-[11px] leading-5 text-muted-foreground">
            部分字段暂缺，可能来自短时服务波动；可重新获取真实数据，仍缺失时不会补造。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-9 shrink-0 rounded-full bg-background px-3 text-[11px] font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            重新获取
          </button>
        </div>
      )}
      {multiSource && (
        <p className="mt-2 rounded-xl bg-primary/[0.06] p-3 text-xs leading-5 text-muted-foreground">
          数值字段由和风天气、OpenWeather 与 Open-Meteo 等权平均；天气现象文字优先采用和风天气，空气质量来自和风天气。单一来源缺失的字段按可用来源计算。
        </p>
      )}
      <p className="mt-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        和风天气提供实况、天气现象与空气质量；OpenWeather、Open-Meteo 与 MET Norway 提供数值与逐小时预报；高/中/低云分层与气溶胶来自 Open-Meteo 或 MET Norway（CC BY 4.0）。来源名称与更新时间均由后端随响应返回。
      </p>
      {weather.sources.includes("Open-Meteo") && (
        <p className="mt-2 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
          Open-Meteo 免费接口用于非商业演示，数据遵循 CC BY 4.0。
        </p>
      )}
    </section>
  );
}

function scoreText(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

function solarEventContext(
  solar: TodayResponse["solar"],
  type: "dawn" | "dusk",
): {
  eventTime: string | null;
  azimuth: number | null;
  elevation: number | null;
} {
  const eventTime = type === "dawn" ? solar.sunrise : solar.sunset;
  const azimuth = type === "dawn"
    ? solar.sunriseAzimuth
    : solar.sunsetAzimuth;
  const target = eventTime ? Date.parse(eventTime) : NaN;
  if (!eventTime || !Number.isFinite(target) || solar.path.length === 0) {
    return { eventTime, azimuth, elevation: null };
  }
  const nearest = solar.path.reduce((best, point) =>
    Math.abs(Date.parse(point.time) - target) <
        Math.abs(Date.parse(best.time) - target)
      ? point
      : best
  );
  return { eventTime, azimuth, elevation: nearest.elevation };
}
