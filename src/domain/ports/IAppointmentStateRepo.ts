import { Appointment } from "../entities/Appointment";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface IAppointmentStateRepo {
  save(appointment: Appointment): Promise<void>;
  findById(appointmentUuid: string): Promise<Appointment | null>;
  markCompleted(appointmentUuid: string): Promise<void>;
  markCancelled(appointmentUuid: string): Promise<void>;
  markRescheduled(appointmentUuid: string): Promise<void>;
  listByInsured(
    insuredId: string,
    pageSize?: number,
    cursor?: string
  ): Promise<Page<Appointment>>;
}
