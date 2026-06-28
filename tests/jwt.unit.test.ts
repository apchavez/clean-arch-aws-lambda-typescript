import { signJwt, verifyJwt } from "../src/infra/jwt";

const SECRET = "portfolio-test-secret-at-least-32-chars";

describe("JWT utility", () => {
  test("sign → verify returns correct sub, role, and valid timestamps", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signJwt("01234", "agent", SECRET);
    const payload = verifyJwt(token, SECRET);

    expect(payload.sub).toBe("01234");
    expect(payload.role).toBe("agent");
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("role claim is preserved for insured", () => {
    const token = signJwt("01234", "insured", SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.role).toBe("insured");
  });

  test("custom expiry is respected", () => {
    const token = signJwt("01234", "agent", SECRET, 7200);
    const payload = verifyJwt(token, SECRET);
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp - now).toBeGreaterThanOrEqual(7199);
    expect(payload.exp - now).toBeLessThanOrEqual(7201);
  });

  test("verify → throws on wrong secret", () => {
    const token = signJwt("01234", "agent", SECRET);
    expect(() => verifyJwt(token, "wrong-secret")).toThrow("Invalid signature");
  });

  test("verify → throws on tampered payload", () => {
    const token = signJwt("01234", "agent", SECRET);
    const [h, , s] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ sub: "99999", role: "agent", iat: 0, exp: 9_999_999_999 })
    ).toString("base64url");
    expect(() => verifyJwt(`${h}.${tampered}.${s}`, SECRET)).toThrow(
      "Invalid signature"
    );
  });

  test("verify → throws on expired token", () => {
    const token = signJwt("01234", "agent", SECRET, -1);
    expect(() => verifyJwt(token, SECRET)).toThrow("Token expired");
  });

  test("verify → throws on malformed token (wrong number of parts)", () => {
    expect(() => verifyJwt("only.two", SECRET)).toThrow("Malformed JWT");
    expect(() => verifyJwt("one.two.three.four", SECRET)).toThrow("Malformed JWT");
  });
});
