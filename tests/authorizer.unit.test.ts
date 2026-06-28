import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { signJwt } from "../src/infra/jwt";
import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";

const ssmMock = mockClient(SSMClient);
const SECRET = "portfolio-test-secret-at-least-32-chars";

type AuthHandler = (
  event: Partial<APIGatewayRequestAuthorizerEventV2>
) => Promise<{ isAuthorized: boolean; context?: Record<string, unknown> }>;

describe("Lambda Authorizer", () => {
  let authorize: AuthHandler;

  beforeAll(async () => {
    process.env.JWT_SECRET_SSM = "/appointments/jwt/secret";
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: SECRET } });
    const mod = await import("../src/api/lambda/authorizer");
    authorize = mod.handler as unknown as AuthHandler;
  });

  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  const makeEvent = (
    authHeader?: string
  ): Partial<APIGatewayRequestAuthorizerEventV2> => ({
    headers: authHeader ? { authorization: authHeader } : {},
  });

  test("valid agent token → isAuthorized: true with sub and role in context", async () => {
    const token = signJwt("01234", "agent", SECRET);
    const res = await authorize(makeEvent(`Bearer ${token}`));
    expect(res.isAuthorized).toBe(true);
    expect(res.context?.sub).toBe("01234");
    expect(res.context?.role).toBe("agent");
  });

  test("valid insured token → isAuthorized: true with role=insured in context", async () => {
    const token = signJwt("01234", "insured", SECRET);
    const res = await authorize(makeEvent(`Bearer ${token}`));
    expect(res.isAuthorized).toBe(true);
    expect(res.context?.role).toBe("insured");
  });

  test("no Authorization header → isAuthorized: false", async () => {
    const res = await authorize(makeEvent());
    expect(res.isAuthorized).toBe(false);
  });

  test("non-Bearer scheme → isAuthorized: false", async () => {
    const res = await authorize(makeEvent("Basic dXNlcjpwYXNz"));
    expect(res.isAuthorized).toBe(false);
  });

  test("token signed with wrong secret → isAuthorized: false", async () => {
    const token = signJwt("01234", "agent", "wrong-secret");
    const res = await authorize(makeEvent(`Bearer ${token}`));
    expect(res.isAuthorized).toBe(false);
  });

  test("expired token → isAuthorized: false", async () => {
    const token = signJwt("01234", "agent", SECRET, -1);
    const res = await authorize(makeEvent(`Bearer ${token}`));
    expect(res.isAuthorized).toBe(false);
  });

  test("tampered payload → isAuthorized: false", async () => {
    const token = signJwt("01234", "agent", SECRET);
    const [h, , s] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ sub: "99999", role: "agent", iat: 0, exp: 9_999_999_999 })
    ).toString("base64url");
    const res = await authorize(makeEvent(`Bearer ${h}.${tampered}.${s}`));
    expect(res.isAuthorized).toBe(false);
  });
});
