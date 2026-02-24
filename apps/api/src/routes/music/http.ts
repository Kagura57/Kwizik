import { logEvent } from "../../lib/logger";
import { recordProviderMetric } from "../../lib/provider-metrics";

type FetchJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  maxTotalRetryMs?: number | null;
  maxRetryAfterMs?: number | null;
  context?: Record<string, unknown>;
  onSuccess?: (details: {
    status: number;
    data: unknown;
    attempt: number;
    retries: number;
  }) => void;
  onHttpError?: (details: {
    status: number;
    retryAfterMs: number | null;
    attempt: number;
    retries: number;
    errorDetail: string | null;
    willRetry: boolean;
  }) => void;
};

type NormalizedFetchJsonOptions =
  Required<Omit<FetchJsonOptions, "onHttpError" | "onSuccess">> &
  Pick<FetchJsonOptions, "onHttpError" | "onSuccess">;

function normalizeOptions(timeoutOrOptions?: number | FetchJsonOptions): NormalizedFetchJsonOptions {
  if (typeof timeoutOrOptions === "number") {
    return {
      timeoutMs: timeoutOrOptions,
      retries: 0,
      retryDelayMs: 250,
      maxTotalRetryMs: null,
      maxRetryAfterMs: null,
      context: {},
      onSuccess: undefined,
      onHttpError: undefined,
    };
  }

  return {
    timeoutMs: timeoutOrOptions?.timeoutMs ?? 4_000,
    retries: Math.max(0, timeoutOrOptions?.retries ?? 2),
    retryDelayMs: Math.max(50, timeoutOrOptions?.retryDelayMs ?? 250),
    maxTotalRetryMs:
      typeof timeoutOrOptions?.maxTotalRetryMs === "number" && timeoutOrOptions.maxTotalRetryMs > 0
        ? timeoutOrOptions.maxTotalRetryMs
        : null,
    maxRetryAfterMs:
      typeof timeoutOrOptions?.maxRetryAfterMs === "number" && timeoutOrOptions.maxRetryAfterMs > 0
        ? timeoutOrOptions.maxRetryAfterMs
        : null,
    context: timeoutOrOptions?.context ?? {},
    onSuccess: timeoutOrOptions?.onSuccess,
    onHttpError: timeoutOrOptions?.onHttpError,
  };
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function sanitizeUrlForLogs(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const sensitiveKeys = [
      "key",
      "api_key",
      "apikey",
      "token",
      "access_token",
      "client_secret",
      "authorization",
    ];

    for (const sensitiveKey of sensitiveKeys) {
      if (parsed.searchParams.has(sensitiveKey)) {
        parsed.searchParams.set(sensitiveKey, "[redacted]");
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl.replace(/(key|token|access_token|client_secret)=([^&]+)/gi, "$1=[redacted]");
  }
}

function delayMs(baseMs: number, attempt: number) {
  const jitter = Math.floor(Math.random() * 60);
  return baseMs * 2 ** attempt + jitter;
}

function parseRetryAfterMs(raw: string | null) {
  if (!raw) return null;
  const asSeconds = Number.parseInt(raw, 10);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseErrorDetail(response: Response) {
  try {
    const raw = (await response.text()).trim();
    if (raw.length === 0) return null;
    try {
      const parsed = JSON.parse(raw) as {
        error?: string | { message?: string; errors?: Array<{ reason?: string; message?: string }> };
      };
      if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
      if (parsed.error && typeof parsed.error === "object") {
        if (typeof parsed.error.message === "string" && parsed.error.message.length > 0) {
          return parsed.error.message;
        }
        const reason = parsed.error.errors?.[0]?.reason?.trim();
        if (reason) return reason;
      }
    } catch {
      // Keep raw text fallback when response is not JSON.
    }
    return raw.slice(0, 200);
  } catch {
    return null;
  }
}

export async function fetchJsonWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutOrOptions: number | FetchJsonOptions = 4_000,
): Promise<unknown> {
  const options = normalizeOptions(timeoutOrOptions);
  const url = typeof input === "string" ? input : input.toString();
  const logUrl = sanitizeUrlForLogs(url);
  const startedAt = Date.now();
  const provider =
    typeof options.context.provider === "string" ? options.context.provider : null;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    let waitOverrideMs: number | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as unknown;
        options.onSuccess?.({
          status: response.status,
          data,
          attempt: attempt + 1,
          retries: options.retries + 1,
        });
        if (provider) {
          recordProviderMetric({
            provider,
            success: true,
            latencyMs: Date.now() - startedAt,
            status: response.status,
            attempts: attempt + 1,
          });
        }
        return data;
      }

      const retryAfterMsRaw = response.status === 429
        ? parseRetryAfterMs(response.headers.get("retry-after"))
        : null;
      const retryAfterMs = retryAfterMsRaw !== null && options.maxRetryAfterMs !== null
        ? Math.min(retryAfterMsRaw, options.maxRetryAfterMs)
        : retryAfterMsRaw;
      const retryable = shouldRetryStatus(response.status);
      const retryDelay = retryAfterMs !== null
        ? Math.max(100, retryAfterMs)
        : delayMs(options.retryDelayMs, attempt);
      const retryBudgetExceeded = options.maxTotalRetryMs !== null &&
        Date.now() - startedAt + retryDelay > options.maxTotalRetryMs;
      const willRetry = retryable && attempt < options.retries && !retryBudgetExceeded;

      if (!willRetry) {
        const errorDetail = await readResponseErrorDetail(response);
        options.onHttpError?.({
          status: response.status,
          retryAfterMs,
          attempt: attempt + 1,
          retries: options.retries + 1,
          errorDetail,
          willRetry: false,
        });
        logEvent("warn", "music_http_non_ok", {
          url: logUrl,
          status: response.status,
          attempt: attempt + 1,
          errorDetail,
          ...options.context,
        });
        if (provider) {
          recordProviderMetric({
            provider,
            success: false,
            latencyMs: Date.now() - startedAt,
            status: response.status,
            error: errorDetail ?? `HTTP_${response.status}`,
            attempts: attempt + 1,
          });
        }
        return null;
      }

      options.onHttpError?.({
        status: response.status,
        retryAfterMs,
        attempt: attempt + 1,
        retries: options.retries + 1,
        errorDetail: null,
        willRetry: true,
      });
      waitOverrideMs = retryDelay;
      logEvent("warn", "music_http_retry_status", {
        url: logUrl,
        status: response.status,
        attempt: attempt + 1,
        retries: options.retries + 1,
        retryAfterMs,
        ...options.context,
      });
    } catch (error) {
      const retryDelay = delayMs(options.retryDelayMs, attempt);
      const retryBudgetExceeded = options.maxTotalRetryMs !== null &&
        Date.now() - startedAt + retryDelay > options.maxTotalRetryMs;

      if (attempt >= options.retries || retryBudgetExceeded) {
        const errorMessage = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        logEvent("warn", "music_http_failure", {
          url: logUrl,
          attempt: attempt + 1,
          retries: options.retries + 1,
          error: errorMessage,
          ...options.context,
        });
        if (provider) {
          recordProviderMetric({
            provider,
            success: false,
            latencyMs: Date.now() - startedAt,
            error: errorMessage,
            attempts: attempt + 1,
          });
        }
        return null;
      }

      logEvent("warn", "music_http_retry_error", {
        url: logUrl,
        attempt: attempt + 1,
        retries: options.retries + 1,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        ...options.context,
      });

      waitOverrideMs = retryDelay;
    } finally {
      clearTimeout(timeout);
    }

    await wait(waitOverrideMs ?? delayMs(options.retryDelayMs, attempt));
  }

  return null;
}
