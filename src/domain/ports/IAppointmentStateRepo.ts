import { Appointment } from "../entities/Appointment";

export interface IAppointmentStateRepo {
  savePending(
    a: Omit<Appointment, "status" | "createdAt" | "updatedAt">
  ): Promise<Appointment>;
  markCompleted(appointmentUuid: string): Promise<void>;
  listByInsured(insuredId: string): Promise<Appointment[]>;
}
