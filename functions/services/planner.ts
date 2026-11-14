import type {
  LocationResult,
  PhotographyPlan,
  ThemeId,
  TimelineItem,
} from "../shared/contracts.ts";

const THEME_NAMES: Record<ThemeId, string> = {
  PORTRAIT: "人像",
  LANDSCAPE: "风光",
  ARCHITECTURE: "建筑",
  STREET: "街拍",
  FOOD: "美食",
  NIGHT: "夜景",
  TRAVEL: "旅行",
};

function locationNote(location: LocationResult): string {
  const coordinates = `纬度${location.latitude.toFixed(4)}、经度${
    location.longitude.toFixed(4)
  }`;
  if (location.precision === "GPS") {
    return `${location.name}，GPS坐标（${coordinates}）；坐标不等于已核实机位，仍需现场确认通行与遮挡`;
  }
  if (location.precision === "MANUAL") {
    return `${location.name}，手动选择位置（${coordinates}）；精度取决于输入，需现场核对拍摄位置`;
  }
  return `${location.name}，区县行政中心近似位置（${coordinates}）；不能据此推断具体机位或视线无遮挡`;
}

function compass(azimuth: number): string {
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}

function viewpoint(theme: ThemeId): string {
  switch (theme) {
    case "PORTRAIT":
      return "在允许拍摄的区域选择背景简洁的位置，让人物与强光源保持可调整距离，并现场检查杂物和遮挡";
    case "LANDSCAPE":
      return "在安全、合法可达的位置寻找前景、中景与远景的层次，不预设任何未核实的制高点或开阔视线";
    case "ARCHITECTURE":
      return "围绕主体建筑现场比较正面与斜侧面机位，预留校正透视和避让人流的空间";
    case "STREET":
      return "在不妨碍通行的位置观察街道延伸、路口和光影边界，遵守当地拍摄与隐私要求";
    case "FOOD":
      return "选择可稳定摆放且不妨碍他人的餐桌或摊位位置，现场确认侧光、背景和经营方要求";
    case "NIGHT":
      return "选择安全且有稳定支撑的位置，现场评估环境灯、暗部和移动光源，不假设场地夜间开放";
    case "TRAVEL":
      return "在实际行程可达的公共区域寻找能交代环境的前景与背景，不编造景点或专属机位";
  }
}

function cameraAngle(theme: ThemeId, item: TimelineItem): string {
  if (item.kind === "NIGHT") {
    return "先以水平或略低机位测试环境光层次，按主体高度和现场畸变调整";
  }
  switch (theme) {
    case "PORTRAIT":
      return "从与人物眼睛接近的高度开始，再比较略低机位的背景简化效果";
    case "LANDSCAPE":
      return "从略低机位强化前景开始，同时保留水平线，按现场前景距离调整";
    case "ARCHITECTURE":
      return "先保持相机水平并尽量留出垂直校正空间，再比较仰拍与斜侧面视角";
    case "STREET":
      return "以眼平视角记录自然场景，也可在安全位置尝试低机位强化街道线条";
    case "FOOD":
      return "从约45度侧俯角度开始，扁平摆盘可比较俯拍，避免遮挡主体";
    case "NIGHT":
      return "以水平构图保留地面参照，按现场灯光与建筑高度调整俯仰";
    case "TRAVEL":
      return "从眼平视角交代环境，再通过略高或略低机位减少干扰元素";
  }
}

function composition(theme: ThemeId): string {
  switch (theme) {
    case "PORTRAIT":
      return "让人物面部或眼神成为视觉中心，利用侧光塑造层次，给视线方向留白并检查边缘干扰";
    case "LANDSCAPE":
      return "用前景引导视线，结合三分法或自然线条组织层次，避免地平线无意切过主体";
    case "ARCHITECTURE":
      return "优先保持垂直线可控，利用对称、重复结构或框架构图，给主体留出完整边界";
    case "STREET":
      return "利用街道引导线、明暗分区和人物尺度形成视觉重点，保留适度环境信息";
    case "FOOD":
      return "突出主体质感和颜色，控制餐具数量与背景杂乱，利用侧光形成适度阴影";
    case "NIGHT":
      return "平衡亮灯区域与暗部轮廓，避免高光占据过多画面，利用线条或倒影组织画面";
    case "TRAVEL":
      return "将主体与环境信息同时纳入画面，用人物、道路或建筑线条建立空间关系";
  }
}

function cameraSettings(theme: ThemeId, item: TimelineItem): string {
  const dark = item.solar.elevation < 0 || item.kind === "NIGHT";
  if (dark) {
    if (theme === "PORTRAIT") {
      return "光圈f/1.8–f/4、快门1/60–1/200s、ISO 400–3200作为起步范围，按人物移动和现场测光调整";
    }
    if (
      theme === "NIGHT" || theme === "LANDSCAPE" || theme === "ARCHITECTURE"
    ) {
      return "光圈f/4–f/11、快门1/15–30s、ISO 100–1600作为起步范围，稳定支撑与长曝降噪按现场条件选择";
    }
    return "光圈f/1.8–f/5.6、快门1/30–1/250s、ISO 400–3200作为起步范围，按防抖、主体运动和现场测光调整";
  }
  switch (theme) {
    case "PORTRAIT":
      return "光圈f/1.8–f/5.6、快门1/125–1/1000s、ISO 100–800作为起步范围，按景深和人物运动调整";
    case "LANDSCAPE":
    case "ARCHITECTURE":
      return "光圈f/5.6–f/11、快门1/15–1/500s、ISO 100–400作为起步范围，按支撑条件和动态元素调整";
    case "STREET":
    case "TRAVEL":
      return "光圈f/2.8–f/8、快门1/125–1/1000s、ISO 100–800作为起步范围，按景深与主体运动调整";
    case "FOOD":
      return "光圈f/2.8–f/8、快门1/60–1/500s、ISO 100–800作为起步范围，按景深、手持稳定性与现场测光调整";
    case "NIGHT":
      return "光圈f/4–f/11、快门1/15–10s、ISO 100–1600作为起步范围，按环境亮度和高光保护调整";
  }
}

function lightAnalysis(item: TimelineItem): string {
  const elevation = item.solar.elevation;
  let analysis: string;
  if (elevation >= 6) {
    analysis = `窗口中点太阳高度约${
      elevation.toFixed(1)
    }°，可能有较强直射光，需现场控制高光与阴影反差`;
  } else if (elevation >= -0.833) {
    analysis = `窗口中点太阳高度约${
      elevation.toFixed(1)
    }°，低角度光有利于侧光与暖色层次，但持续时间受地形和云层影响`;
  } else if (elevation >= -6) {
    analysis = `窗口中点太阳高度约${
      elevation.toFixed(1)
    }°，主要依靠地平线下的天空微光，霞光与颜色并不能保证出现`;
  } else {
    analysis = `窗口中点太阳高度约${
      elevation.toFixed(1)
    }°，以环境人工光和天空残余亮度为主，需现场确认暗部与安全`;
  }
  if (item.weather?.cloud !== null && item.weather?.cloud !== undefined) {
    analysis += `；附近逐小时云量约${
      item.weather.cloud.toFixed(0)
    }%，实际光线仍可能快速变化`;
  } else {
    analysis += "；缺少可靠云量覆盖，不推断一定有金色阳光或霞光";
  }
  return analysis;
}

export function buildRulePlans(
  timeline: TimelineItem[],
  theme: ThemeId,
  location: LocationResult,
): PhotographyPlan[] {
  return timeline
    .filter((item) =>
      !item.isPast && Date.parse(item.end) > Date.parse(item.start)
    )
    .sort((first, second) => {
      const scoreDifference = (second.score ?? -1) - (first.score ?? -1);
      if (scoreDifference) return scoreDifference;
      if (first.scoreMode !== second.scoreMode) {
        return first.scoreMode === "FULL" ? -1 : 1;
      }
      return Date.parse(first.start) - Date.parse(second.start);
    })
    .slice(0, 3)
    .map((item) => {
      const direction = item.kind === "NIGHT" || item.solar.elevation < -6
        ? "夜间朝向按主体和现场灯光选择；太阳方位仅作天文参考，不代表主体朝向或视线条件"
        : `窗口中点太阳约在${compass(item.solar.azimuth)}方（${
          item.solar.azimuth.toFixed(0)
        }°，正北0°顺时针）；据此现场比较顺光、侧光与逆光`;
      return {
        slotId: item.slotId,
        theme,
        title: `${THEME_NAMES[theme]}｜${item.label}`,
        timeWindow: { start: item.start, end: item.end },
        locationNote: locationNote(location),
        viewpoint: viewpoint(theme),
        direction,
        cameraAngle: cameraAngle(theme, item),
        composition: composition(theme),
        cameraSettings: cameraSettings(theme, item),
        lightAnalysis: lightAnalysis(item),
        risks: [
          ...new Set([
            ...item.risks,
            "实际机位、通行条件、遮挡和天气需现场核实，建议保留替代构图与安全撤离方案",
          ]),
        ],
        aiEnhanced: false,
      };
    });
}
