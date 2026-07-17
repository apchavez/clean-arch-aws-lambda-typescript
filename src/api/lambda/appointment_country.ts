import type { SQSHandler } from "aws-lambda";
import type { Appointment } from "../../domain/entities/Appointment";
import type { EventSource } from "../../domain/types";
import { appointmentCountryMakeService } from "../../index";
import { logger } from "../../shared/logger";

const svc = appointmentCountryMakeService();

function sourceFor(countryISO: Appointment["countryISO"]): EventSource {
  return countryISO === "PE" ? "appointment.pe" : "appointment.cl";
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    try {
      const raw = JSON.parse(record.body) as Record<string, unknown>;
      const payload = (raw.Message
        ? JSON.parse(raw.Message as string)
        : raw) as Appointment;
      await svc.process(sourceFor(payload.countryISO), payload);
    } catch (err) {
      logger.error("Failed to process country booking record", {
        messageId: record.messageId,
        error: String(err),
      });
      throw err;
    }
  }
};
