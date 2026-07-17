import type { APIGatewayProxyEvent } from "aws-lambda";
import type { Role } from "../domain/types";

export interface AuthContext {
  sub: string;
  role: Role;
}

const VALID_ROLES: Role[] = ["agent", "insured"];

export function getAuthContext(event: APIGatewayProxyEvent): AuthContext | null {
  // HTTP API (v2 payload format) places Lambda Authorizer context here
  const rc = event.requestContext as unknown as {
    authorizer?: { lambda?: Record<string, unknown> };
  };
  const ctx = rc?.authorizer?.lambda;
  if (!ctx?.sub || !ctx?.role) return null;
  const role = String(ctx.role) as Role;
  if (!VALID_ROLES.includes(role)) return null;
  return { sub: String(ctx.sub), role };
}
