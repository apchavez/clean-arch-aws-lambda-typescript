import { appointmentMakeService } from "../../index";
import { ok, created, bad } from "../../shared/http";

const svc = appointmentMakeService();

export const createAppointment = async (event: any) => {
  if (!event.body) return bad("Required body");

  let payload: any;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return bad("Invalid body (JSON)");
  }

  const { insuredId, scheduleId, countryISO } = payload;

  if (!insuredId || scheduleId == null || !countryISO) {
    return bad("insuredId, scheduleId and countryISO are required");
  }
  if (!["PE", "CL"].includes(String(countryISO))) {
    return bad("countryISO must be 'PE' or 'CL'");
  }
  if (Number.isNaN(Number(scheduleId))) {
    return bad("scheduleId must be numeric");
  }

  const appointment = await svc.create({
    insuredId: String(insuredId),
    scheduleId: Number(scheduleId),
    countryISO: countryISO,
  });
  return created(appointment);
};

export const listByInsured = async (event: any) => {
  const insuredId = event.pathParameters?.insuredId;
  if (!insuredId) return bad("insuredId required");
  return ok(await svc.listByInsured(String(insuredId)));
};

export const confirmAppointment = async (event: any) => {
  for (const r of event.Records ?? []) {
    let body: any;
    try {
      body = JSON.parse(r.body);
    } catch {
      continue;
    }
    const detail = body?.detail ?? body;
    const { appointmentUuid } = detail;
    if (!appointmentUuid) continue;

    await svc.complete(String(appointmentUuid));
  }
};
