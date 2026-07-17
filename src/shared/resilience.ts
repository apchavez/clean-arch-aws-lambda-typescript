/**
 * Minimal retry + circuit breaker, mirroring the Azure sibling project's Resilience4j config:
 * Retry - 3 attempts, exponential backoff starting at 100ms (100 -> 200 -> 400).
 * CircuitBreaker - count-based window of 10 calls, opens at >=50% failures, stays open 30s,
 * allows 3 probe calls in half-open state.
 */

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;
const CB_WINDOW_SIZE = 10;
const CB_FAILURE_RATE_THRESHOLD = 0.5;
const CB_OPEN_DURATION_MS = 30_000;
const CB_HALF_OPEN_PROBES = 3;

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is open`);
  }
}

type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private results: boolean[] = [];
  private openedAt = 0;
  private halfOpenProbesInFlight = 0;

  constructor(private readonly name: string) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt < CB_OPEN_DURATION_MS) {
        throw new CircuitOpenError(this.name);
      }
      this.state = "half-open";
      this.halfOpenProbesInFlight = 0;
    }

    if (this.state === "half-open") {
      if (this.halfOpenProbesInFlight >= CB_HALF_OPEN_PROBES) {
        throw new CircuitOpenError(this.name);
      }
      this.halfOpenProbesInFlight++;
    }

    try {
      const result = await fn();
      this.record(true);
      return result;
    } catch (err) {
      this.record(false);
      throw err;
    }
  }

  private record(success: boolean): void {
    if (this.state === "half-open") {
      this.state = success ? "closed" : "open";
      if (this.state === "open") this.openedAt = Date.now();
      this.results = [];
      return;
    }

    this.results.push(success);
    if (this.results.length > CB_WINDOW_SIZE) this.results.shift();

    if (this.results.length === CB_WINDOW_SIZE) {
      const failureRate =
        this.results.filter((r) => !r).length / this.results.length;
      if (failureRate >= CB_FAILURE_RATE_THRESHOLD) {
        this.state = "open";
        this.openedAt = Date.now();
        this.results = [];
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries fn up to RETRY_ATTEMPTS times with exponential backoff. CircuitOpenError is never
 * retried - a call rejected by an open circuit should fail fast, not burn through attempts.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof CircuitOpenError) throw err;
      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

export function withResilience(name: string) {
  const breaker = new CircuitBreaker(name);
  return <T>(fn: () => Promise<T>): Promise<T> =>
    withRetry(() => breaker.execute(fn));
}
