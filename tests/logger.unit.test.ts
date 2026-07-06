import { logger } from "../src/shared/logger";

describe("logger", () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("info -> writes a JSON line to console.log with level INFO and merged context", () => {
    logger.info("hello", { foo: "bar" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "INFO", message: "hello", foo: "bar" });
    expect(typeof parsed.timestamp).toBe("string");
  });

  test("warn -> writes to console.log with level WARN", () => {
    logger.warn("careful");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("careful");
  });

  test("debug -> writes to console.log with level DEBUG", () => {
    logger.debug("tracing detail", { step: 1 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "DEBUG", message: "tracing detail", step: 1 });
  });

  test("error -> writes to console.error (not console.log) with level ERROR", () => {
    logger.error("boom", { code: 500 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "ERROR", message: "boom", code: 500 });
  });
});
