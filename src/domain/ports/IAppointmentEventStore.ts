import { AppointmentEvent } from "../entities/AppointmentEvent";

export interface IAppointmentEventStore {
  append(event: AppointmentEvent): Promise<void>;
  findByAppointmentId(appointmentUuid: string): Promise<AppointmentEvent[]>;
}
