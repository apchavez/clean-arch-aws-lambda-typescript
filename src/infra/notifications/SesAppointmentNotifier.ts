import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Appointment } from "../../domain/entities/Appointment";
import type { IAppointmentNotifier } from "../../domain/ports/IAppointmentNotifier";
import { captureAWSClient } from "../tracing";
import { logger } from "../../shared/logger";

/**
 * Best-effort: a notification failure must never propagate to the caller - the appointment
 * lifecycle takes precedence. Skips silently when contactEmail is absent.
 */
export class SesAppointmentNotifier implements IAppointmentNotifier {
  private readonly ses = captureAWSClient(new SESv2Client({}));
  private readonly senderAddress = process.env.SES_SENDER_ADDRESS!;

  async notifyCompleted(appointment: Appointment): Promise<void> {
    if (!appointment.contactEmail) return;
    await this.send(
      appointment.contactEmail,
      "Your appointment has been confirmed",
      `Your appointment (ID: ${appointment.appointmentUuid}, schedule: ${appointment.scheduleId}) has been successfully processed.`
    );
  }

  async notifyCancelled(appointment: Appointment): Promise<void> {
    if (!appointment.contactEmail) return;
    await this.send(
      appointment.contactEmail,
      "Your appointment has been cancelled",
      `Your appointment (ID: ${appointment.appointmentUuid}, schedule: ${appointment.scheduleId}) has been cancelled.`
    );
  }

  async notifyRescheduled(old: Appointment, newAppointment: Appointment): Promise<void> {
    if (!old.contactEmail) return;
    await this.send(
      old.contactEmail,
      "Your appointment has been rescheduled",
      `Your appointment (ID: ${old.appointmentUuid}) has been rescheduled to a new slot (schedule: ${newAppointment.scheduleId}). New appointment ID: ${newAppointment.appointmentUuid}.`
    );
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.ses.send(
        new SendEmailCommand({
          FromEmailAddress: this.senderAddress,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject },
              Body: { Text: { Data: body } },
            },
          },
        })
      );
      logger.info("Notification sent", { to, subject });
    } catch (err) {
      logger.warn("Notification failed (best-effort, continuing)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
