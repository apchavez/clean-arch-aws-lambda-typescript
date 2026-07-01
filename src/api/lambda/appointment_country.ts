import type { SQSHandler } from "aws-lambda";
import type { Appointment } from "../../domain/entities/Appointment";
import type { EventSource } from "../../domain/types";
import { appointmentCountryMakeService } from "../../index";
import { logger } from "../../shared/logger";

const svc = appointmentCountryMakeService();

function makeCountryHandler(source: EventSource): SQSHandler {
  return async (event) => {
    for (const record of event.Records) {
      try {
        const raw = JSON.parse(record.body) as Record<string, unknown>;
        const payload = (raw.Message
          ? JSON.parse(raw.Message as string)
          : raw) as Appointment;
        await svc.process(source, payload);
      } catch (err) {
        logger.error("Failed to process country booking record", {
          source,
          messageId: record.messageId,
          error: String(err),
        });
        throw err;
      }
    }
  };
}

export const handlerPE = makeCountryHandler("appointment.pe");
export const handlerCL = makeCountryHandler("appointment.cl");
