import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  CloudSun,
  MapPin,
  Sparkles,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  LocationResult,
  SlotKind,
  ThemeId,
  TimelineItem,
  TodayResponse,
  WeatherData,
} from "@/functions/shared/contracts";
import {
  compass,
  formatDate,
  formatObservedAt,
  formatTime,
  summarizeMissingFields,
} from "@/src/lib/format";
import {
  pickSlot,
  windowGroupLabel,
  type ShootingSpot,
} from "@/src/lib/shooting";
import { Skeleton } from "@/components/ui/skeleton";
import { ShootingContextBar } from "@/src/components/ShootingContextBar";
import { GlowConclusion } from "@/src/components/GlowConclusion";
import { SpotPicker } from "@/src/components/SpotPicker";
import { WindowCompare } from "@/src/components/WindowCompare";
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
    intro: "查看实况、云层、能见度与未来趋势，快速判断今天是否值得出门。",
    icon: CloudSun,
  },
  LIGHT: {
    title: "霞光与光线",
    intro: "查看朝霞、晚霞、火烧云与全天光线窗口。",
    icon: Sunrise,
  },
  PLANS: {
    title: "拍摄方案",
    intro: "按题材生成时间、方向、构图与参数建议。",
    icon: Sparkles,
  },
  SPOTS: {
    title: "地点推荐",
    intro:
      "按题材查找周边摄影点，结合日出日落方位安排窗口。",
    icon: MapPin,
  },
  PHOTO: {
    title: "照片分析",
    intro: "上传照片，按题材、EXIF 与画质给出改进建议。",
    icon: Camera,
  },
};

type LocationSectionId = Exclude<SectionId, "PHOTO">;

const LOCATION_SECTIONS: LocationSectionId[] = ["WEATHER", "LIGHT", "PLANS", "SPOTS"];

const TABS: Record<SectionId, { id: string; label: string; intro: string }[]> = {
  WEATHER: [
    {
      id: "current",
      label: "实况与逐小时",
      intro: "实况观测与未来逐小时预报。",
    },
    {
      id: "indices",
      label: "摄影指数",
      intro: "七个题材的独立评分与因子依据。",
    },
    {
      id: "sources",
      label: "来源与完整性",
      intro: "来源、更新时间与缺失字段。",
    },
  ],
  LIGHT: [
    {
      id: "glow",
      label: "霞光与火烧云",
      intro: "朝霞、晚霞与火烧云的环境评分、方向与最佳时间。",
    },
    {
      id: "solar",
      label: "机位与太阳轨迹",
      intro: "定位精确机位、查看太阳全天轨迹与当前窗口的相机朝向。",
    },
    {
      id: "timeline",
      label: "时间轴",
      intro: "按太阳高度角筛选清晨、傍晚与夜间窗口。",
    },
    {
      id: "compare",
      label: "窗口对比",
      intro: "对比同一机位的不同日期，或同一天的不同机位。",
    },
  ],
  PLANS: [
    {
      id: "custom",
      label: "自定义题材",
      intro: "方案包含时间、方向、天气与拍摄参数。",
    },
  ],
  SPOTS: [
    {
      id: "spots",
      label: "摄影点推荐",
      intro: "周边摄影点与日出日落方向。",
    },
  ],
  PHOTO: [
    {
      id: "upload",
      label: "上传分析",
      intro: "本地推断题材，结合 EXIF 与画质统计给出技术建议。",
    },
    {
      id: "records",
      label: "拍摄记录",
      intro: "当前浏览器保存的方案与分析记录。",
    },
    {
      id: "method",
      label: "分析依据",
      intro: "题材推断、EXIF 与画质指标说明。",
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
  spot: ShootingSpot | null;
  section: SectionId | null;
  direction: "forward" | "back";
  theme: ThemeId;
  slotId: string | null;
  slotKind: SlotKind | null;
  dayOffset: number;
  targetDate: string;
  equipment: string;
  loading: boolean;
  onDayChange: (offset: number) => void;
  onSectionChange: (section: SectionId | null) => void;
  onNeedLocation: () => void;
  onSelectSlot: (slotId: string) => void;
  onThemeChange: (theme: ThemeId) => void;
  onEquipmentChange: (equipment: string) => void;
  onChooseSpot: (
    spot: ShootingSpot,
    options?: { resetDate?: boolean; slotKind?: SlotKind | null },
  ) => void;
  onResetSession: () => void;
  onRetry: () => void;
  onChangeLocation: () => void;
}

export function FeatureHub({
  data,
  location,
  spot,
  section,
  direction,
  theme,
  slotId,
  slotKind,
  dayOffset,
  targetDate,
  equipment,
  loading,
  onDayChange,
  onSectionChange,
  onNeedLocation,
  onSelectSlot,
  onThemeChange,
  onEquipmentChange,
  onChooseSpot,
  onResetSession,
  onRetry,
  onChangeLocation,
}: FeatureHubProps) {
  if (section === null) {
    return (
      <div className={direction === "back" ? "pm-view-back" : "pm-view"}>
        <FeatureMenu
          data={data}
          location={location}
          spot={spot}
          loading={loading}
          dayOffset={dayOffset}
          targetDate={targetDate}
          theme={theme}
          slotKind={slotKind}
          onSectionChange={onSectionChange}
          onNeedLocation={onNeedLocation}
          onThemeChange={onThemeChange}
          onDayChange={onDayChange}
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
        spot={spot}
        section={section}
        theme={theme}
        slotId={slotId}
        slotKind={slotKind}
        dayOffset={dayOffset}
        targetDate={targetDate}
        equipment={equipment}
        loading={loading}
        onDayChange={onDayChange}
        onSectionChange={onSectionChange}
        onSelectSlot={onSelectSlot}
        onThemeChange={onThemeChange}
        onEquipmentChange={onEquipmentChange}
        onChooseSpot={onChooseSpot}
        onResetSession={onResetSession}
        onRetry={onRetry}
        onChangeLocation={onChangeLocation}
      />
    </div>
  );
}

function FeatureMenu({
  data,
  location,
  spot,
  loading,
  dayOffset,
  targetDate,
  theme,
  slotKind,
  onSectionChange,
  onNeedLocation,
  onThemeChange,
  onDayChange,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  spot: ShootingSpot | null;
  loading: boolean;
  dayOffset: number;
  targetDate: string;
  theme: ThemeId;
  slotKind: SlotKind | null;
  onSectionChange: (section: SectionId) => void;
  onNeedLocation: () => void;
  onThemeChange: (theme: ThemeId) => void;
  onDayChange: (offset: number) => void;
}) {
  const dayLabel = DAY_OPTIONS.find((item) => item.offset === dayOffset)
    ?.label ?? "今天";

  return (
    <section className="mt-5" aria-labelledby="feature-menu-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="feature-menu-title"
            className="text-lg font-semibold tracking-tight 2xl:text-xl"
          >
            功能导航
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground 2xl:text-sm">
            {location
              ? "四个环境功能共用当前拍摄位置；照片分析无需位置。"
              : "实况天气、霞光与光线、拍摄方案、地点推荐需要先选择拍摄位置；照片分析无需位置。"}
          </p>
        </div>
      </div>

      {spot && (
        <ShootingContextBar
          spot={spot}
          dayOffset={dayOffset}
          targetDate={targetDate}
          slot={data ? pickSlot(data.timeline, slotKind, null) : null}
          theme={theme}
          loading={loading}
          onChangeLocation={onNeedLocation}
          onThemeChange={onThemeChange}
          onDayChange={onDayChange}
          compact
        />
      )}

      <div className="mt-3 space-y-2.5 sm:space-y-3">
        <PhotoEntry onOpen={() => onSectionChange("PHOTO")} />
        <div
          className="pm-stagger grid grid-cols-1 gap-2 xs:grid-cols-2 xs:gap-2.5 sm:gap-3"
          aria-busy={loading && location !== null && data === null}
        >
          {LOCATION_SECTIONS.map((id, index) => {
            const meta = SECTION_META[id];
            const Icon = meta.icon;
            const state = locationCardState(id, data, location, loading, dayLabel);
            return (
              <button
                key={id}
                type="button"
                style={{ "--pm-index": index + 1 } as React.CSSProperties}
                onClick={() =>
                  state.needsLocation ? onNeedLocation() : onSectionChange(id)}
                className="group flex min-h-[72px] flex-col items-stretch rounded-[var(--radius)] border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 xs:min-h-[104px] xs:p-3.5 sm:p-5 lg:min-h-36"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5 xs:flex-none xs:flex-col xs:items-stretch xs:gap-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105 sm:size-10 sm:rounded-2xl">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 xs:mt-3">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 text-sm font-semibold sm:text-base lg:text-lg">
                        {meta.title}
                      </h3>
                      {state.needsLocation ? (
                        <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/75 sm:inline-flex">
                          需要位置
                        </span>
                      ) : (
                        <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                      )}
                    </div>
                    <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block lg:text-sm lg:leading-6">
                      {meta.intro}
                    </p>
                  </div>
                </div>
                <div className="mt-auto pt-2">
                  {state.needsLocation && (
                    <span className="mb-1.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/75 sm:hidden">
                      需要位置
                    </span>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {state.status}
                  </p>
                  <span className="mt-2 block">
                    {state.needsLocation ? (
                      <span className="inline-flex items-center rounded-full border border-primary/35 px-2.5 py-1 text-xs font-semibold text-primary transition group-hover:border-primary/60 group-hover:bg-primary/5">
                        {state.cta}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-primary lg:text-sm">
                        {state.cta}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PhotoEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="照片分析，无需位置，上传照片开始分析"
      className="pm-rise group flex w-full items-center gap-3 rounded-[var(--radius)] border border-primary/20 bg-primary/[0.05] p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:p-4"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
        <Camera className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold sm:text-base">照片分析</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            无需位置
          </span>
        </span>
        <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">
          题材推断 · EXIF · 画质统计 · 云端分析摘要
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">
        上传照片 →
      </span>
    </button>
  );
}

function locationCardState(
  id: LocationSectionId,
  data: TodayResponse | null,
  location: LocationResult | null,
  loading: boolean,
  dayLabel: string,
): { status: string; cta: string; needsLocation: boolean } {
  if (!location) {
    const copy: Record<LocationSectionId, string> = {
      WEATHER: "选择位置后显示实况",
      LIGHT: "选择位置后显示霞光",
      PLANS: "选择位置后生成方案",
      SPOTS: "选择位置后推荐摄影点",
    };
    return { status: copy[id], cta: "选择拍摄位置 →", needsLocation: true };
  }

  if (id === "WEATHER") {
    const weather = data?.weather.current;
    const cta = "查看天气 →";
    if (weather) {
      const parts = [
        weather.temperature === null
          ? null
          : `${Math.round(weather.temperature)}°`,
        weather.condition || null,
        weather.cloud === null ? null : `云 ${Math.round(weather.cloud)}%`,
      ].filter((item): item is string => Boolean(item));
      return {
        status: parts.join(" · ") || "实况暂不可用",
        cta,
        needsLocation: false,
      };
    }
    return {
      status: !data && loading
        ? "正在获取实况与逐小时预报"
        : "数据暂不可用，可重试",
      cta,
      needsLocation: false,
    };
  }

  if (id === "LIGHT") {
    return {
      status: data
        ? `${dayLabel} · 朝 ${scoreText(data.potential.dawn.score)} · 晚 ${
          scoreText(data.potential.dusk.score)
        }`
        : loading
        ? "正在计算霞光与光线窗口"
        : "数据暂不可用，可重试",
      cta: "查看光线窗口 →",
      needsLocation: false,
    };
  }

  if (id === "PLANS") {
    return {
      status: data
        ? `${dayLabel} · 时间、方向与拍摄参数`
        : loading
        ? "正在准备拍摄方案"
        : "数据暂不可用，可重试",
      cta: "查看拍摄方案 →",
      needsLocation: false,
    };
  }

  return {
    status: `${dayLabel} · 周边摄影点与日出日落方位`,
    cta: "查看摄影点 →",
    needsLocation: false,
  };
}

function SectionDetail({
  data,
  location,
  spot,
  section,
  theme,
  slotId,
  slotKind,
  dayOffset,
  targetDate,
  equipment,
  loading,
  onDayChange,
  onSectionChange,
  onSelectSlot,
  onThemeChange,
  onEquipmentChange,
  onChooseSpot,
  onResetSession,
  onRetry,
  onChangeLocation,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  spot: ShootingSpot | null;
  section: SectionId;
  theme: ThemeId;
  slotId: string | null;
  slotKind: SlotKind | null;
  dayOffset: number;
  targetDate: string;
  equipment: string;
  loading: boolean;
  onDayChange: (offset: number) => void;
  onSectionChange: (section: SectionId | null) => void;
  onSelectSlot: (slotId: string) => void;
  onThemeChange: (theme: ThemeId) => void;
  onEquipmentChange: (equipment: string) => void;
  onChooseSpot: (
    spot: ShootingSpot,
    options?: { resetDate?: boolean; slotKind?: SlotKind | null },
  ) => void;
  onResetSession: () => void;
  onRetry: () => void;
  onChangeLocation: () => void;
}) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  const tabs = TABS[section];
  const [tab, setTab] = useState(tabs[0].id);
  const [period, setPeriod] = useState("all");
  const slot: TimelineItem | null = data
    ? pickSlot(data.timeline, slotKind, slotId)
    : null;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const sectionKey = section.toLowerCase();
  const tabId = (id: string) => `${sectionKey}-${id}-tab`;
  const panelId = `${sectionKey}-${tab}-panel`;
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    setTab(next.id);
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };
  const panelProps = tabs.length > 1
    ? {
      role: "tabpanel" as const,
      id: panelId,
      "aria-labelledby": tabId(tab),
      tabIndex: 0,
    }
    : {};
  const periodKinds = PERIODS.find((item) => item.id === period)?.kinds ?? null;
  const filteredTimeline = data && periodKinds
    ? data.timeline.filter((item) => periodKinds.includes(item.kind))
    : data?.timeline ?? [];
  const tabBar = (
    <div
      role="tablist"
      aria-label={`${meta.title}二级菜单`}
      aria-orientation="horizontal"
      className="mt-4 flex flex-wrap gap-2 pb-1"
    >
      {tabs.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => {
            tabRefs.current[item.id] = element;
          }}
          id={tabId(item.id)}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          aria-controls={`${sectionKey}-${item.id}-panel`}
          tabIndex={tab === item.id ? 0 : -1}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
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

      <div className="relative mt-2 flex items-start gap-4 overflow-hidden rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm 2xl:p-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-primary/[0.07] blur-2xl"
        />
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary 2xl:size-12">
          <Icon className="size-5 2xl:size-6" />
        </span>
        <div className="relative min-w-0">
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

      {spot && section !== "PHOTO" && (
        <ShootingContextBar
          spot={spot}
          dayOffset={dayOffset}
          targetDate={targetDate}
          slot={slot}
          theme={theme}
          loading={loading}
          onChangeLocation={onChangeLocation}
          onDayChange={onDayChange}
          onThemeChange={onThemeChange}
        />
      )}

      {section === "SPOTS" && (
        location
          ? (
            <div className="mt-4">
              <SpotRecommendations
                location={location}
                date={targetDate}
                theme={theme}
                slot={slot}
                onThemeChange={onThemeChange}
                onPickSpot={(picked, target, kind) => {
                  onChooseSpot(picked, { slotKind: kind ?? slotKind });
                  onSectionChange(target);
                }}
              />
            </div>
          )
          : <LocationPrompt onChangeLocation={onChangeLocation} />
      )}

      {section !== "PHOTO" && section !== "SPOTS" && !data && (
        location
          ? <DataPending loading={loading} />
          : <LocationPrompt onChangeLocation={onChangeLocation} />
      )}

      {section === "PHOTO" && (
        <>
          {tabBar}
          <div
            key={tab}
            {...panelProps}
            className="pm-panel mt-2 focus-visible:outline-none"
          >
            <p className="text-xs leading-5 text-muted-foreground">
              {activeTab.intro}
            </p>
            <div className="mt-4">
              {tab === "upload"
                ? <PhotoAnalysis />
                : tab === "records"
                ? <PhotoRecords />
                : <PhotoMethod />}
            </div>
          </div>
        </>
      )}

      {section !== "PHOTO" && section !== "SPOTS" && data && (
        <>
          {tabs.length > 1 && tabBar}
          <div
            key={tab}
            {...panelProps}
            className="pm-panel mt-4 focus-visible:outline-none"
          >
            <p className="text-xs leading-5 text-muted-foreground">
              {activeTab.intro}
            </p>

            <div className="mt-4">
            {section === "WEATHER" && tab === "current" && (
              <WeatherOverview
                weather={data.weather}
                targetDate={targetDate}
                alerts={data.alerts}
                slot={slot}
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
              <div key={data.date} className="pm-panel space-y-5">
                <GlowConclusion data={data} slot={slot} />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
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
                  const EventIcon = type === "dawn" ? Sunrise : Sunset;
                  return (
                    <section key={type} aria-labelledby={`glow-${type}-title`}>
                      <div className="flex items-center gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <EventIcon className="size-3.5" />
                        </span>
                        <h3
                          id={`glow-${type}-title`}
                          className="shrink-0 text-sm font-semibold"
                        >
                          {type === "dawn" ? "朝霞" : "晚霞"}
                        </h3>
                        <span
                          aria-hidden="true"
                          className="h-px min-w-6 flex-1 bg-border"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {type === "dawn" ? "日出" : "日落"}{" "}
                          {context.eventTime ? formatTime(context.eventTime) : "—"}
                          {context.azimuth !== null &&
                            ` · ${compass(context.azimuth)} ${
                              Math.round(context.azimuth)
                            }°`}
                        </span>
                      </div>
                      {/* items-start：两张卡片各自按内容高度收放，展开时不再把另一张拉长留白 */}
                      <div className="mt-3 grid items-start gap-4 xl:grid-cols-2">
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
                    </section>
                  );
                })}
                <p className="rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
                  中高云适量、低云不挡光、空气通透时更有利于火烧云。评分依据窗口云量、分层云与气溶胶数据，现场观察仍是最终判断。
                </p>
              </div>
            )}
            {section === "LIGHT" && tab === "solar" && (
              <div className="space-y-4">
                {spot && (
                  <SpotPicker
                    spot={spot}
                    slot={slot}
                    onChooseSpot={onChooseSpot}
                    onChangeLocation={onChangeLocation}
                  />
                )}
                <SolarPath
                  solar={data.solar}
                  date={targetDate}
                  location={location}
                />
              </div>
            )}
            {section === "LIGHT" && tab === "compare" && spot && (
              <WindowCompare
                spot={spot}
                dayOffset={dayOffset}
                targetDate={targetDate}
                theme={theme}
                slot={slot}
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
                      className={`min-h-11 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
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
                  selectedSlotId={slot?.slotId ?? null}
                  onSelectSlot={onSelectSlot}
                />
              </>
            )}
            {section === "PLANS" && (
              spot
                ? (
                  <CustomPlanPanel
                    data={data}
                    spot={spot}
                    theme={theme}
                    slot={slot}
                    equipment={equipment}
                    onSelectSlot={onSelectSlot}
                    onEquipmentChange={onEquipmentChange}
                  />
                )
                : <LocationPrompt onChangeLocation={onChangeLocation} />
            )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DataPending({ loading }: { loading: boolean }) {
  if (!loading) {
    return (
      <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border bg-card/60 p-5 text-sm leading-6 text-muted-foreground">
        暂时没有获取到环境数据。可在页面上方重试，或更换拍摄位置。
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3" role="status" aria-live="polite">
      <span className="sr-only">正在获取环境数据</span>
      <Skeleton className="h-36 w-full rounded-[var(--radius)]" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-[var(--radius)]" />
        <Skeleton className="h-28 rounded-[var(--radius)]" />
      </div>
    </div>
  );
}

function LocationPrompt({
  onChangeLocation,
}: {
  onChangeLocation?: () => void;
}) {
  return (
    <div className="mt-4 grid min-h-52 place-items-center rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <MapPin className="mx-auto size-8 text-primary" />
        <h3 className="mt-3 text-lg font-semibold">先确定拍摄位置</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          搜索区县、使用定位或手动输入坐标即可；天气、光线、地点与方案会自动沿用该位置。
        </p>
        {onChangeLocation && (
          <button
            type="button"
            onClick={onChangeLocation}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <MapPin className="size-4" />选择拍摄位置
          </button>
        )}
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
        天气和空气质量来自真实服务；缺失字段会标注并暂停相关评分。
      </p>
      {weather.status === "STALE" && (
        <p className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-5 text-muted-foreground">
          当前为短时真实缓存，观测与预报时间保持不变；评分置信度已按数据时效降低。
        </p>
      )}
      {weather.missingFields.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <p className="text-xs leading-5 text-muted-foreground">
            部分字段暂缺；重新获取后仍缺失时会明确标注。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 shrink-0 rounded-full bg-background px-3 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
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
        和风天气提供实况与空气质量；OpenWeather、Open-Meteo、MET Norway 提供预报与分层云量；更新时间随响应返回。
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
