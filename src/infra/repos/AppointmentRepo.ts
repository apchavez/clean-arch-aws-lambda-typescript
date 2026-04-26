import type { Appointment } from "../../domain/entities/Appointment";

export interface AppointmentReadRepository {
  consultByInsuredId(insuredId: string): Promise<Appointment[]>;
}

export interface AppointmentWriteRepository {
  save(appointment: Appointment): Promise<void>;
  markCompleted(appointmentUuid: string): Promise<void>;
}

export interface AppointmentRdsRepository {
  writeByCountry(appointment: Appointment): Promise<void>;
}
