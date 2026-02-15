const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class FetchRetryError extends Error {
  constructor(message, { type = "unknown", url = "", status = null, attempts = 1, cause } = {}) {
    super(message);
    this.name = "FetchRetryError";
    this.type = type;
    this.url = url;
    this.status = status;
    this.attempts = attempts;
    if (cause) this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const computeBackoff = ({ attempt, baseDelayMs, maxDelayMs, jitterRatio }) => {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jitter = Math.floor(Math.random() * exp * jitterRatio);
  return Math.min(maxDelayMs, exp + jitter);
};

export async function fetchWithTimeoutRetry(
  url,
  options = {},
  {
    timeoutMs = 8000,
    retries = 1,
    retryDelayMs = 300,
    maxRetryDelayMs = 5000,
    jitterRatio = 0.2,
    retryOnStatuses = RETRYABLE_STATUSES,
  } = {}
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;

    const onExternalAbort = () => {
      timeoutController.abort(externalSignal?.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new FetchRetryError("Request aborted", {
          type: "aborted",
          url,
          attempts: attempt + 1,
        });
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: timeoutController.signal,
      });

      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }

      const isRetryableStatus =
        (retryOnStatuses instanceof Set
          ? retryOnStatuses.has(response.status)
          : retryOnStatuses.includes(response.status)) && attempt < retries;

      if (isRetryableStatus) {
        const delay = computeBackoff({
          attempt,
          baseDelayMs: retryDelayMs,
          maxDelayMs: maxRetryDelayMs,
          jitterRatio,
        });
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }

      if (externalSignal?.aborted) {
        throw new FetchRetryError("Request aborted", {
          type: "aborted",
          url,
          attempts: attempt + 1,
          cause: err,
        });
      }

      lastError = new FetchRetryError(
        timedOut ? "Request timeout" : "Network request failed",
        {
          type: timedOut ? "timeout" : "network",
          url,
          attempts: attempt + 1,
          cause: err,
        }
      );

      if (attempt >= retries) break;

      const delay = computeBackoff({
        attempt,
        baseDelayMs: retryDelayMs,
        maxDelayMs: maxRetryDelayMs,
        jitterRatio,
      });
      await sleep(delay);
    }
  }

  throw (
    lastError ||
    new FetchRetryError("Request failed", {
      type: "unknown",
      url,
      attempts: retries + 1,
    })
  );
}
