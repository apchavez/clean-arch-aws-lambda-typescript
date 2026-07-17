import { CircuitBreaker, CircuitOpenError, withResilience, withRetry } from "../src/shared/resilience";

describe("withRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns the result on first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries up to 3 attempts with exponential backoff, then succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws the last error after exhausting all 3 attempts", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"));

    const promise = withRetry(fn);
    promise.catch(() => {});
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("does not retry a CircuitOpenError", async () => {
    const fn = jest.fn().mockRejectedValue(new CircuitOpenError("test"));
    await expect(withRetry(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("CircuitBreaker", () => {
  test("stays closed and passes calls through while failures stay under the 50% threshold", async () => {
    const cb = new CircuitBreaker("test");
    for (let i = 0; i < 4; i++) {
      await cb.execute(async () => "ok");
    }
    await expect(cb.execute(async () => "still-ok")).resolves.toBe("still-ok");
  });

  test("opens after a 10-call window with >=50% failures, then rejects fast", async () => {
    const cb = new CircuitBreaker("test");
    // 5 failures, 5 successes = exactly 50% -> opens on the 10th call.
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(async () => "ok")).resolves.toBe("ok");
    }
    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    }
    // 10th call in the window - failure rate hits 50%, circuit opens as a side effect.
    await expect(cb.execute(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    await expect(cb.execute(async () => "should not run")).rejects.toThrow(CircuitOpenError);
  });

  test("half-opens after the wait duration and closes again on a successful probe", async () => {
    jest.useFakeTimers();
    const cb = new CircuitBreaker("test");
    for (let i = 0; i < 5; i++) await cb.execute(async () => "ok");
    for (let i = 0; i < 5; i++) {
      await cb.execute(() => Promise.reject(new Error("boom"))).catch(() => {});
    }
    await expect(cb.execute(async () => "x")).rejects.toThrow(CircuitOpenError);

    jest.advanceTimersByTime(30_000);

    await expect(cb.execute(async () => "recovered")).resolves.toBe("recovered");
    // Circuit closed again -> subsequent calls run normally, not limited to 3 probes.
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(async () => "ok")).resolves.toBe("ok");
    }
    jest.useRealTimers();
  });
});

describe("withResilience", () => {
  test("combines retry and circuit breaker: a failing dependency eventually fails fast", async () => {
    jest.useFakeTimers();
    const resilient = withResilience("combo-test");
    const alwaysFails = () => Promise.reject(new Error("dependency down"));

    // Each call burns 3 retry attempts against the same breaker instance; after enough failed
    // calls the breaker opens and subsequent calls short-circuit via CircuitOpenError (which
    // withRetry does not retry), so callsBeforeOpen effectively stops growing.
    let circuitOpened = false;
    for (let i = 0; i < 6 && !circuitOpened; i++) {
      const p = resilient(alwaysFails).catch((e) => e);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(200);
      const err = await p;
      if (err instanceof CircuitOpenError) circuitOpened = true;
    }

    expect(circuitOpened).toBe(true);
    jest.useRealTimers();
  });
});
