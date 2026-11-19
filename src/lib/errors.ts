import { ApiError } from "./api";

export type FailureKind =
  | "not-found"
  | "network"
  | "permission"
  | "service"
  | "input"
  | "photo"
  | "unknown";

export interface Failure {
  kind: FailureKind;
  title: string;
  message: string;
  retryable: boolean;
}

export type FailureContext = "location" | "photo" | "data";

export function describeFailure(
  error: unknown,
  context: FailureContext = "data",
): Failure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return {
          kind: "network",
          title: "网络连接异常",
          message: context === "location"
            ? "暂时无法连接地点服务，请检查网络后重试，或改用手动坐标。"
            : "暂时无法连接摄影服务，请检查网络后重试。",
          retryable: true,
        };
      case "LOCATION_UNAVAILABLE":
        return {
          kind: "service",
          title: "地点服务暂时不可用",
          message: "请重试，或改用手动坐标。",
          retryable: true,
        };
      case "LOCATION_UNCONFIGURED":
        return {
          kind: "service",
          title: "地点服务尚未配置",
          message: "可先改用手动坐标继续查看拍摄条件。",
          retryable: false,
        };
      case "LOCATION_NOT_FOUND":
        return {
          kind: "not-found",
          title: "没有找到这个地点",
          message: error.message || "请换一个更完整的区县名称，或改用手动坐标。",
          retryable: true,
        };
      case "INVALID_COORDINATES":
      case "INVALID_LOCATION":
      case "INVALID_QUERY":
      case "INVALID_INPUT":
        return {
          kind: "input",
          title: "输入需要调整",
          message: error.message,
          retryable: false,
        };
      case "INVALID_RESPONSE":
        if (context === "photo") {
          return {
            kind: "photo",
            title: "照片分析失败",
            message: "云端分析返回异常，可仅重试分析，本地统计结果会保留。",
            retryable: true,
          };
        }
        if (context === "location") {
          return {
            kind: "service",
            title: "地点服务暂时不可用",
            message: "请重试，或改用手动坐标。",
            retryable: true,
          };
        }
        return {
          kind: "service",
          title: "数据服务返回异常",
          message: "已保留当前输入，可以直接重试。",
          retryable: true,
        };
      case "INVALID_PHOTO":
        return {
          kind: "photo",
          title: "照片分析请求无效",
          message: error.message,
          retryable: false,
        };
      case "INTERNAL_ERROR":
      default:
        if (context === "photo") {
          return {
            kind: "photo",
            title: "照片分析失败",
            message: error.message || "云端分析暂时不可用，可仅重试分析。",
            retryable: true,
          };
        }
        if (context === "location") {
          return {
            kind: "service",
            title: "地点服务暂时不可用",
            message: "请重试，或改用手动坐标。",
            retryable: error.retryable,
          };
        }
        return {
          kind: "service",
          title: "数据服务暂时不可用",
          message: "已保留当前位置和输入，请稍后重试。",
          retryable: error.retryable,
        };
    }
  }

  if (context === "location") {
    return {
      kind: "unknown",
      title: "地点搜索失败",
      message: "地点服务暂时不可用，请重试，或改用手动坐标。",
      retryable: true,
    };
  }
  if (context === "photo") {
    return {
      kind: "photo",
      title: "照片分析失败",
      message: error instanceof Error && error.message
        ? error.message
        : "云端分析暂时不可用，可仅重试分析。",
      retryable: true,
    };
  }
  return {
    kind: "unknown",
    title: "请求未能完成",
    message: error instanceof Error && error.message
      ? error.message
      : "请稍后重试，已选位置和输入会保留。",
    retryable: true,
  };
}

export function geolocationFailure(
  error: GeolocationPositionError,
): Failure {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      kind: "permission",
      title: "定位权限被拒绝",
      message: "可在浏览器允许定位，或搜索区县、手动输入坐标。",
      retryable: false,
    };
  }
  if (error.code === error.TIMEOUT) {
    return {
      kind: "network",
      title: "定位超时",
      message: "暂时无法获取当前位置，请重试，或搜索区县、手动输入坐标。",
      retryable: true,
    };
  }
  return {
    kind: "service",
    title: "暂时无法获取位置",
    message: "请稍后重试，或搜索区县、手动输入坐标。",
    retryable: true,
  };
}
