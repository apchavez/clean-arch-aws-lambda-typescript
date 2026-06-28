import { createHmac, timingSafeEqual } from "crypto";
import type { Role } from "../domain/types";

export interface JwtPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

function base64urlDecode(s: string): Buffer {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const [headerB64, payloadB64, sigB64] = parts;

  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  // Constant-time comparison prevents timing-based signature oracle attacks
  if (
    sigB64.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sigB64), Buffer.from(expected))
  ) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(
    base64urlDecode(payloadB64).toString("utf8")
  ) as JwtPayload;

  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}

export function signJwt(
  sub: string,
  role: Role,
  secret: string,
  expiresInSeconds = 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, role, iat: now, exp: now + expiresInSeconds })
  ).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}
