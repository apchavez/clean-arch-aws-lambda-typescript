import { Appointment } from "../entities/Appointment";

export interface IAppointmentStateRepo {
  save(appointment: Appointment): Promise<void>;
  markCompleted(appointmentUuid: string): Promise<void>;
  listByInsured(insuredId: string): Promise<Appointment[]>;
}
