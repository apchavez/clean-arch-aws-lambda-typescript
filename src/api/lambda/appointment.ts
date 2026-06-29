import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSEvent,
} from "aws-lambda";
import { appointmentMakeService } from "../../index";
import { ok, created, bad, forbidden, internal } from "../../shared/http";
import { getAuthContext } from "../../shared/auth";
import { logger } from "../../shared/logger";
import type { CountryISO } from "../../domain/types";

const INSURED_ID_RE = /^\d{5}$/;
const VALID_COUNTRIES = ["PE", "CL"] as const;

const svc = appointmentMakeService();

export const createAppointment = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) return bad("Required body");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return bad("Invalid body (JSON)");
  }

  const { insuredId, scheduleId, countryISO } = payload;

  if (!insuredId || scheduleId == null || !countryISO) {
    return bad("insuredId, scheduleId and countryISO are required");
  }
  if (!INSURED_ID_RE.test(String(insuredId))) {
    return bad("insuredId must be 5 digits");
  }
  if (!VALID_COUNTRIES.includes(String(countryISO) as CountryISO)) {
    return bad("countryISO must be 'PE' or 'CL'");
  }
  if (Number.isNaN(Number(scheduleId)) || Number(scheduleId) < 1) {
    return bad("scheduleId must be a positive integer");
  }

  const auth = getAuthContext(event);
  if (!auth) return forbidden();

  if (auth.role === "insured" && String(insuredId) !== auth.sub) {
    return forbidden("insured can only book appointments for themselves");
  }

  try {
    const appointment = await svc.create({
      insuredId: String(insuredId),
      scheduleId: Number(scheduleId),
      countryISO: countryISO as CountryISO,
    });
    return created(appointment);
  } catch (err) {
    logger.error("createAppointment failed", { error: String(err) });
    return internal();
  }
};

export const listByInsured = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const insuredId = event.pathParameters?.insuredId;
  if (!insuredId) return bad("insuredId required");
  if (!INSURED_ID_RE.test(insuredId)) return bad("insuredId must be 5 digits");

  const auth = getAuthContext(event);
  if (!auth) return forbidden();

  if (auth.role === "insured" && insuredId !== auth.sub) {
    return forbidden("insured can only view their own appointments");
  }

  try {
    return ok(await svc.listByInsured(String(insuredId)));
  } catch (err) {
    logger.error("listByInsured failed", { insuredId, error: String(err) });
    return internal();
  }
};

export const confirmAppointment = async (event: SQSEvent): Promise<void> => {
  for (const r of event.Records) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(r.body) as Record<string, unknown>;
    } catch {
      logger.warn("confirmAppointment: skipping malformed record", {
        messageId: r.messageId,
      });
      continue;
    }
    const detail = (body.detail ?? body) as Record<string, unknown>;
    const { appointmentUuid } = detail;
    if (!appointmentUuid) {
      logger.warn("confirmAppointment: record missing appointmentUuid", {
        messageId: r.messageId,
      });
      continue;
    }
    await svc.complete(String(appointmentUuid));
  }
};
