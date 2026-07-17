import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSEvent,
} from "aws-lambda";
import { appointmentMakeService } from "../../index";
import { ok, created, accepted, bad, forbidden, notFound, conflict, internal } from "../../shared/http";
import { getAuthContext } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { NotFoundError, ConflictError } from "../../shared/errors";
import type { CountryISO } from "../../domain/types";

const INSURED_ID_RE = /^\d{5}$/;
const VALID_COUNTRIES = ["PE", "CL"] as const;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const svc = appointmentMakeService();

function parsePageSize(raw: string | undefined): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) return DEFAULT_PAGE_SIZE;
  return n;
}

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

  const { insuredId, scheduleId, countryISO, contactEmail } = payload;

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
      contactEmail: contactEmail ? String(contactEmail) : undefined,
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
    const pageSize = parsePageSize(event.queryStringParameters?.pageSize);
    const cursor = event.queryStringParameters?.cursor;
    const page = await svc.listByInsured(String(insuredId), pageSize, cursor);
    return ok(page);
  } catch (err) {
    logger.error("listByInsured failed", { insuredId, error: String(err) });
    return internal();
  }
};

export const cancelAppointment = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const appointmentUuid = event.pathParameters?.appointmentUuid;
  if (!appointmentUuid) return bad("appointmentUuid required");

  const auth = getAuthContext(event);
  if (!auth) return forbidden();

  try {
    const appointment = await svc.getById(appointmentUuid);
    if (!appointment) return notFound(`Appointment not found: ${appointmentUuid}`);
    if (auth.role === "insured" && appointment.insuredId !== auth.sub) {
      return forbidden("insured can only cancel their own appointments");
    }

    await svc.cancel(appointmentUuid);
    return ok({ message: "Appointment cancelled", appointmentUuid });
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(err.message);
    if (err instanceof ConflictError) return conflict(err.message);
    logger.error("cancelAppointment failed", { appointmentUuid, error: String(err) });
    return internal("Internal error cancelling appointment");
  }
};

export const rescheduleAppointment = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const appointmentUuid = event.pathParameters?.appointmentUuid;
  if (!appointmentUuid) return bad("appointmentUuid required");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.body ?? "") as Record<string, unknown>;
  } catch {
    return bad("Request body is required");
  }
  const newScheduleId = Number(payload.newScheduleId);
  if (!Number.isInteger(newScheduleId) || newScheduleId < 1) {
    return bad("newScheduleId (integer >= 1) is required");
  }

  const auth = getAuthContext(event);
  if (!auth) return forbidden();

  try {
    const appointment = await svc.getById(appointmentUuid);
    if (!appointment) return notFound(`Appointment not found: ${appointmentUuid}`);
    if (auth.role === "insured" && appointment.insuredId !== auth.sub) {
      return forbidden("insured can only reschedule their own appointments");
    }

    const newAppointment = await svc.reschedule(appointmentUuid, newScheduleId);
    return accepted({
      message: "Appointment rescheduled",
      newAppointmentUuid: newAppointment.appointmentUuid,
      newScheduleId,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(err.message);
    if (err instanceof ConflictError) return conflict(err.message);
    logger.error("rescheduleAppointment failed", { appointmentUuid, error: String(err) });
    return internal("Internal error rescheduling appointment");
  }
};

export const getAppointmentHistory = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const appointmentUuid = event.pathParameters?.appointmentUuid;
  if (!appointmentUuid) return bad("appointmentUuid required");

  const auth = getAuthContext(event);
  if (!auth) return forbidden();

  try {
    const events = await svc.getHistory(appointmentUuid);
    if (
      auth.role === "insured" &&
      events.length > 0 &&
      events[0].insuredId !== auth.sub
    ) {
      return forbidden("insured can only view their own appointment history");
    }
    return ok(events);
  } catch (err) {
    logger.error("getAppointmentHistory failed", { appointmentUuid, error: String(err) });
    return internal("Internal error fetching appointment history");
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
