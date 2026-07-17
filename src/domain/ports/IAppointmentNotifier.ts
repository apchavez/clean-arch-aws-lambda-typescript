import { Appointment } from "../entities/Appointment";

/**
 * Implementations are expected to be best-effort: a notification failure must NOT propagate to the
 * caller — the appointment lifecycle takes precedence.
 */
export interface IAppointmentNotifier {
  notifyCompleted(appointment: Appointment): Promise<void>;
  notifyCancelled(appointment: Appointment): Promise<void>;
  notifyRescheduled(old: Appointment, newAppointment: Appointment): Promise<void>;
}
