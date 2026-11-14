export type ProviderHttpErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "NETWORK_ERROR";

/** A sanitized error: it never contains request URLs, credentials, or upstream bodies. */
export class ProviderHttpError extends Error {
  readonly code: ProviderHttpErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    code: ProviderHttpErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ProviderHttpError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export interface TrustedJsonRequest {
  /** A server-side constant or validated server configuration value, never user input. */
  baseUrl: string;
  /** A relative path supplied by the provider client. */
  path: string;
  /** Exact trusted hostnames or their parent domains. */
  allowedHosts: readonly string[];
  query?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  headers?: HeadersInit;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Additional attempts; capped at two and ignored for POST. */
  retries?: number;
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;

export function isHostnameAllowed(
  hostname: string,
  allowedHosts: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase();
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function buildTrustedUrl(options: TrustedJsonRequest): URL {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new ProviderHttpError(
      "INVALID_URL",
      "The upstream service URL is invalid.",
    );
  }

  if (
    base.protocol !== "https:" ||
    base.username !== "" ||
    base.password !== "" ||
    base.search !== "" ||
    base.hash !== "" ||
    !isHostnameAllowed(base.hostname, options.allowedHosts)
  ) {
    throw new ProviderHttpError(
      "INVALID_URL",
      "The upstream service URL is not trusted.",
    );
  }

  const normalizedBase = new URL(base.href);
  if (!normalizedBase.pathname.endsWith("/")) normalizedBase.pathname += "/";
  const url = new URL(options.path.replace(/^\/+/, ""), normalizedBase);
  if (
    url.protocol !== "https:" ||
    url.origin !== base.origin ||
    url.username !== "" ||
    url.password !== "" ||
    !isHostnameAllowed(url.hostname, options.allowedHosts)
  ) {
    throw new ProviderHttpError(
      "INVALID_URL",
      "The upstream request URL is not trusted.",
    );
  }

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new ProviderHttpError(
      "RESPONSE_TOO_LARGE",
      "The upstream response exceeded the size limit.",
    );
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderHttpError(
          "RESPONSE_TOO_LARGE",
          "The upstream response exceeded the size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ProviderHttpError(
      "INVALID_JSON",
      "The upstream response was not valid JSON.",
    );
  }
}

async function requestOnce<T>(
  url: URL,
  options: TrustedJsonRequest,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(options.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      throw new ProviderHttpError(
        "HTTP_ERROR",
        `The upstream service returned HTTP ${response.status}.`,
        {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        },
      );
    }

    const text = await readLimitedBody(
      response,
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ProviderHttpError(
        "INVALID_JSON",
        "The upstream response was not valid JSON.",
      );
    }
  } catch (error) {
    if (error instanceof ProviderHttpError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderHttpError(
        "TIMEOUT",
        "The upstream request timed out.",
        {
          retryable: true,
        },
      );
    }
    throw new ProviderHttpError(
      "NETWORK_ERROR",
      "The upstream service could not be reached.",
      {
        retryable: true,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

function pause(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchTrustedJson<T>(
  options: TrustedJsonRequest,
): Promise<T> {
  const url = buildTrustedUrl(options);
  const method = options.method ?? "GET";
  const retries = method === "GET"
    ? Math.min(2, Math.max(0, Math.floor(options.retries ?? 1)))
    : 0;
  const retryDelayMs = Math.min(
    1_000,
    Math.max(0, options.retryDelayMs ?? 100),
  );

  for (let attempt = 0;; attempt++) {
    try {
      return await requestOnce<T>(url, options);
    } catch (error) {
      const safeError = error instanceof ProviderHttpError
        ? error
        : new ProviderHttpError(
          "NETWORK_ERROR",
          "The upstream service could not be reached.",
        );
      if (attempt >= retries || !safeError.retryable) throw safeError;
      await pause(retryDelayMs);
    }
  }
}
