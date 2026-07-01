import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { verifyJwt } from "../../infra/jwt";
import { logger } from "../../shared/logger";

// @types/aws-lambda omits `context` from the simple response type even though
// HTTP API authorizers support it — define a complete local interface.
interface SimpleAuthorizerResult {
  isAuthorized: boolean;
  context?: Record<string, string | number | boolean>;
}

const ssm = new SSMClient({});
let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const name = process.env.JWT_SECRET_SSM;
  if (!name) throw new Error("JWT_SECRET_SSM is not defined");
  const out = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  const value = out.Parameter?.Value;
  if (!value) throw new Error("JWT secret not found in SSM");
  cachedSecret = value;
  return cachedSecret;
}

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2
): Promise<SimpleAuthorizerResult> => {
  const authHeader =
    event.headers?.authorization ?? event.headers?.Authorization ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    logger.warn("authorizer: missing or malformed Authorization header");
    return { isAuthorized: false };
  }

  const token = authHeader.slice(7);

  try {
    const secret = await getSecret();
    const payload = verifyJwt(token, secret);
    logger.info("authorizer: token accepted", { sub: payload.sub, role: payload.role });
    return {
      isAuthorized: true,
      context: { sub: payload.sub, role: payload.role },
    };
  } catch (err) {
    logger.warn("authorizer: token rejected", { error: String(err) });
    return { isAuthorized: false };
  }
};
