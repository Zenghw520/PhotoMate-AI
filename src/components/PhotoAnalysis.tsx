import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImageUp,
  Info,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  PhotoAnalysisResponse,
  PhotoExif,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
} from "@/functions/shared/contracts";
import { analyzePhoto } from "@/src/lib/api";
import { parseJpegExif } from "@/src/lib/exif";
import { measurePhoto } from "@/src/lib/photo";
import { decodeRaw, isRawFile, RAW_ACCEPT } from "@/src/lib/raw";
import { addRecord } from "@/src/lib/records";

const MAX_BYTES = 150 * 1024 * 1024;

function shutterText(seconds: number) {
  return seconds >= 1
    ? `${Number(seconds.toFixed(1))}s`
    : `1/${Math.round(1 / seconds)}s`;
}

function fileMime(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
    return file.type;
  }
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

function exifChips(exif: PhotoExif) {
  const chips: { label: string; value: string }[] = [];
  const camera = [exif.make, exif.model].filter(Boolean).join(" ");
  if (camera) chips.push({ label: "相机", value: camera });
  if (exif.lens) chips.push({ label: "镜头", value: exif.lens });
  if (exif.focalLength !== null || exif.focalLength35 !== null) {
    chips.push({
      label: "焦距",
      value: `${exif.focalLength ?? exif.focalLength35}mm${
        exif.focalLength35 !== null && exif.focalLength !== null
          ? `（等效 ${exif.focalLength35}mm）`
          : ""
      }`,
    });
  }
  if (exif.fNumber !== null) chips.push({ label: "光圈", value: `f/${exif.fNumber}` });
  if (exif.exposureTime !== null) {
    chips.push({ label: "快门", value: shutterText(exif.exposureTime) });
  }
  if (exif.iso !== null) chips.push({ label: "ISO", value: String(exif.iso) });
  if (exif.dateTimeOriginal) {
    chips.push({ label: "时间", value: exif.dateTimeOriginal });
  }
  if (exif.hasGps) chips.push({ label: "位置", value: "含 GPS（仅本地）" });
  return chips;
}

function StatsGrid({ stats }: { stats: PhotoStats }) {
  const items = [
    { label: "分辨率", value: `${stats.width}×${stats.height}` },
    { label: "画面比例", value: `${stats.aspectRatio}:1` },
    { label: "亮度", value: `${Math.round(stats.brightness)}/100` },
    { label: "对比", value: `${Math.round(stats.contrast)}/100` },
    { label: "饱和", value: `${Math.round(stats.saturation)}/100` },
    { label: "相对清晰度", value: `${stats.sharpness}/100` },
    { label: "暗部死黑", value: `${stats.shadowsClipped.toFixed(1)}%` },
    { label: "高光溢出", value: `${stats.highlightsClipped.toFixed(1)}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-sm font-medium tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function FindingList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "warn" | "tip";
}) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Lightbulb;
  const color = tone === "good"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn"
    ? "text-amber-600 dark:text-amber-400"
    : "text-primary";
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={`size-4 ${color}`} />{title}
      </h4>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.length
          ? items.slice(0, 3).map((item) => <li key={item}>· {item}</li>)
          : <li>暂无。</li>}
      </ul>
      {items.length > 3 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-primary">
            其余 {items.length - 3} 条
          </summary>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
            {items.slice(3).map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function confidenceText(confidence: PhotoScene["confidence"]) {
  if (confidence === "HIGH") return "较高";
  if (confidence === "MEDIUM") return "中等";
  return "较低";
}

function aiLabel(status: PhotoAnalysisResponse["aiStatus"]) {
  if (status === "SUCCESS") return "DeepSeek 摘要";
  if (status === "LIMIT_REACHED") return "规则摘要 · 额度已用完";
  if (status === "DISABLED") return "规则摘要";
  return "规则摘要";
}

export function PhotoAnalysis() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number; mime: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exif, setExif] = useState<PhotoExif | null>(null);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [scene, setScene] = useState<PhotoScene | null>(null);
  const [signals, setSignals] = useState<PhotoSignals | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysisResponse | null>(null);
  const [source, setSource] = useState("");
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [savedRecord, setSavedRecord] = useState(false);

  function saveAnalysis() {
    if (!analysis || !file) return;
    addRecord({
      kind: "analysis",
      fileName: file.name,
      sceneLabel: analysis.scene.label,
      confidence: confidenceText(analysis.confidenceLevel),
      summary: analysis.summary,
      issues: analysis.issues,
      suggestions: analysis.suggestions,
      exifSummary: analysis.exifSummary,
    });
    setSavedRecord(true);
  }

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function prepare(selected: File) {
    if (selected.size > MAX_BYTES) {
      setError("照片不能超过 150MB。");
      return;
    }
    const rawFile = isRawFile(selected.name);
    const mime = rawFile ? "image/x-raw" : fileMime(selected);
    const accepted = rawFile ||
      /^image\/(jpeg|png|webp)$/.test(selected.type) ||
      /\.(jpe?g|png|webp)$/i.test(selected.name);
    if (!accepted || (!rawFile && !/^image\/(jpeg|png|webp)$/.test(mime))) {
      setError("仅支持 JPEG、PNG、WebP 或主流 RAW 照片。");
      return;
    }
    setError("");
    setReading(true);
    setAnalysis(null);
    setSavedRecord(false);
    setExif(null);
    setStats(null);
    setScene(null);
    setSignals(null);
    setSource("");
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setFile({ name: selected.name, size: selected.size, mime });
    try {
      if (rawFile) {
        const decoded = await decodeRaw(selected);
        setExif(decoded.exif);
        setStats(decoded.stats);
        setScene(decoded.scene);
        setSignals(decoded.signals);
        setSource(decoded.source);
        setPreview(URL.createObjectURL(decoded.preview));
      } else {
        setPreview(URL.createObjectURL(selected));
        let parsedExif: PhotoExif | null = null;
        if (mime === "image/jpeg") {
          try {
            parsedExif = parseJpegExif(await selected.arrayBuffer());
          } catch {
            parsedExif = null;
          }
        }
        const measurement = await measurePhoto(selected, parsedExif);
        setExif(parsedExif);
        setStats(measurement.stats);
        setScene(measurement.scene);
        setSignals(measurement.signals);
        setSource("标准图像");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "照片无法解析，请尝试 JPEG、PNG 或 DNG。");
    } finally {
      setReading(false);
    }
  }

  async function startAnalysis() {
    if (!file || !stats || !scene || !signals) return;
    setAnalyzing(true);
    setError("");
    setSavedRecord(false);
    try {
      const result = await analyzePhoto({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mime,
        exif,
        stats,
        scene,
        signals,
      });
      setAnalysis(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "照片分析暂不可用，请稍后重试。");
    } finally {
      setAnalyzing(false);
    }
  }

  const chips = exif ? exifChips(exif) : [];
  const displayScene = analysis?.scene ?? scene;

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ImageUp className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">上传照片获取改进建议</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              支持 JPEG / PNG / WebP 与主流 RAW，最大 150MB；原始图像只在浏览器本地解析。
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={`image/jpeg,image/png,image/webp,${RAW_ACCEPT}`}
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected) void prepare(selected);
          }}
        />
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const selected = event.dataTransfer.files?.[0];
            if (selected) void prepare(selected);
          }}
          className="mt-4 rounded-2xl border border-dashed border-border bg-muted/25 p-5 text-center"
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <ImageUp className="size-4" />选择照片
          </button>
          <p className="mt-2 text-xs text-muted-foreground">也可以把照片拖到这里</p>
          {file && (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
            </p>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          RAW 在浏览器内通过 LibRaw WASM 解码；分析请求只包含相机参数、画质统计与题材推断结果。
        </p>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {reading && (
        <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          {file?.mime === "image/x-raw"
            ? "正在本地解码 RAW 并计算画质统计…"
            : "正在本地读取照片元数据与画质统计…"}
        </div>
      )}

      {preview && stats && scene && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-sm">
            <img
              src={preview}
              alt="待分析照片预览"
              className="max-h-80 w-full rounded-xl bg-black/20 object-contain 2xl:max-h-[28rem]"
            />
          </div>
          <div className="space-y-3">
            <section className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Camera className="size-4 text-primary" />照片参数
                </h4>
                {source && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    {source}
                  </span>
                )}
              </div>
              {chips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <span key={`${chip.label}-${chip.value}`} className="rounded-full bg-muted px-3 py-1 text-xs">
                      <span className="text-muted-foreground">{chip.label}</span>
                      <span className="ml-1 font-medium">{chip.value}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  未检测到可用 EXIF，仍可根据画质统计给出技术建议。
                </p>
              )}
            </section>
            <section className="rounded-[var(--radius)] border border-primary/20 bg-primary/[0.05] p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <ScanSearch className="size-4 text-primary" />识别题材
                </h4>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  {displayScene?.label} · 置信度{" "}
                  {confidenceText(displayScene?.confidence ?? "LOW")}
                  {displayScene?.source === "DEEPSEEK" && " · DeepSeek 复核"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                {displayScene?.basis.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                题材由本地像素统计推断，DeepSeek 基于同一组特征复核。
              </p>
            </section>
            <section className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
              <h4 className="text-sm font-semibold">本地画质统计</h4>
              <div className="mt-3"><StatsGrid stats={stats} /></div>
            </section>
          </div>
        </div>
      )}

      {stats && (
        <button
          type="button"
          onClick={startAnalysis}
          disabled={analyzing}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {analyzing
            ? <><LoaderCircle className="size-4 animate-spin" />正在分析…</>
            : analysis
            ? <><RefreshCw className="size-4" />重新分析</>
            : <><Sparkles className="size-4" />开始分析</>}
        </button>
      )}

      {analysis && (
        <div className="space-y-3">
          <section className="rounded-[var(--radius)] border border-primary/20 bg-primary/[0.05] p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="size-3" />{aiLabel(analysis.aiStatus)}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                按「{analysis.scene.label}」评价
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                依据完整度{" "}
                {analysis.confidenceLevel === "HIGH"
                  ? "较高"
                  : analysis.confidenceLevel === "MEDIUM"
                  ? "中等"
                  : "较低"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6">{analysis.summary}</p>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveAnalysis}
              disabled={savedRecord}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-60"
            >
              <CheckCircle2 className="size-3.5" />
              {savedRecord ? "已保存到拍摄记录" : "保存分析记录"}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <FindingList title="可保持" items={analysis.strengths} tone="good" />
            <FindingList title="关注" items={analysis.issues} tone="warn" />
            <FindingList title="建议" items={analysis.suggestions} tone="tip" />
          </div>

          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              EXIF 摘要（{analysis.exifSummary.length}）
            </summary>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              {analysis.exifSummary.map((item) => <li key={item}>· {item}</li>)}
            </ul>
          </details>

          <p className="flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />{analysis.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

export function PhotoMethod() {
  return (
    <div className="space-y-3">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <Camera className="size-4 text-primary" />RAW 解码
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>· NEF、ARW、CR2、CR3、DNG、RAF、ORF、RW2 等通过 LibRaw WASM 在浏览器内解码。</li>
          <li>· 若完整解码失败，会自动回退到相机内嵌 JPEG 预览，并在“照片参数”处标注来源。</li>
          <li>· 大文件可能解码数秒并占用较多内存；原始 RAW 不会上传。</li>
        </ul>
        <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-4 text-muted-foreground">
          RAW 解码基于 LibRaw（LGPL-2.1 / CDDL）与 libraw-wasm（ISC）。
        </p>
      </section>
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <Camera className="size-4 text-primary" />读取的 EXIF 字段
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>· 相机与镜头、焦距、光圈、快门、ISO、曝光补偿、拍摄时间与方向。</li>
          <li>· 仅判断是否包含 GPS，具体坐标不会发送到服务器。</li>
          <li>· 没有 EXIF 时仍会分析画质统计，但建议会更有限。</li>
        </ul>
      </section>
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <Info className="size-4 text-primary" />本地画质统计
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>· 在浏览器内把图像缩放到固定尺寸，统计亮度、对比、饱和度与高光/暗部截断比例。</li>
          <li>· “相对清晰度”来自拉普拉斯方差，用于比较同组照片的清晰度差异。</li>
          <li>· 统计结果受缩图、主体纹理与后期影响，建议仅作为技术参考。</li>
        </ul>
      </section>
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <ScanSearch className="size-4 text-primary" />题材推断
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>· 根据亮度分布、肤色像素比例、天空与植被占比、边缘密度和中心/边缘清晰度差异，推断最可能的题材。</li>
          <li>· 题材只用于切换评价侧重点，例如人像关注景深与手持快门，风光关注景深与高光细节。</li>
          <li>· 本地像素统计先推断题材，DeepSeek 再依据同一组特征复核，给出技术建议；人物、物体与构图结合现场判断。</li>
        </ul>
      </section>
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />边界与隐私
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>· 原始照片不上传；服务端只接收相机参数、统计数值与题材推断结果。</li>
          <li>· 不做语义识别，不判断构图或天气，也不识别具体人物与物体。</li>
          <li>· DeepSeek 先依据同一组像素特征复核题材，再润色结论摘要；规则发现保持不变，AI 不可用时自动回退。</li>
        </ul>
      </section>
    </div>
  );
}
