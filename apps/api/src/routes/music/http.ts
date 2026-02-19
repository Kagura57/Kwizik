import { logEvent } from "../../lib/logger";
import { recordProviderMetric } from "../../lib/provider-metrics";

type FetchJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  context?: Record<string, unknown>;
};

function normalizeOptions(timeoutOrOptions?: number | FetchJsonOptions): Required<FetchJsonOptions> {
  if (typeof timeoutOrOptions === "number") {
    return {
      timeoutMs: timeoutOrOptions,
      retries: 0,
      retryDelayMs: 250,
      context: {},
    };
  }

  return {
    timeoutMs: timeoutOrOptions?.timeoutMs ?? 4_000,
    retries: Math.max(0, timeoutOrOptions?.retries ?? 2),
    retryDelayMs: Math.max(50, timeoutOrOptions?.retryDelayMs ?? 250),
    context: timeoutOrOptions?.context ?? {},
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
        if (provider) {
          recordProviderMetric({
            provider,
            success: true,
            latencyMs: Date.now() - startedAt,
            status: response.status,
            attempts: attempt + 1,
          });
        }
        return (await response.json()) as unknown;
      }

      const retryable = shouldRetryStatus(response.status);
      if (!retryable || attempt >= options.retries) {
        const errorDetail = await readResponseErrorDetail(response);
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

      logEvent("warn", "music_http_retry_status", {
        url: logUrl,
        status: response.status,
        attempt: attempt + 1,
        retries: options.retries + 1,
        ...options.context,
      });
    } catch (error) {
      if (attempt >= options.retries) {
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
    } finally {
      clearTimeout(timeout);
    }

    await wait(delayMs(options.retryDelayMs, attempt));
  }

  return null;
}
