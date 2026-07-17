import type { Appointment } from "../../domain/entities/Appointment";
import type { IAppointmentNotifier } from "../../domain/ports/IAppointmentNotifier";

/** Used when SES_SENDER_ADDRESS is not configured (e.g. local development). */
export class NoOpAppointmentNotifier implements IAppointmentNotifier {
  async notifyCompleted(_appointment: Appointment): Promise<void> {}
  async notifyCancelled(_appointment: Appointment): Promise<void> {}
  async notifyRescheduled(_old: Appointment, _newAppointment: Appointment): Promise<void> {}
}
