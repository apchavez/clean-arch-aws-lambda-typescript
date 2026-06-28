import { randomUUID } from "crypto";
import type { Appointment } from "../../domain/entities/Appointment";
import type { IAppointmentStateRepo } from "../../domain/ports/IAppointmentStateRepo";
import type { IMessageBus } from "../../domain/ports/IMessageBus";

export class AppointmentService {
  constructor(
    private readonly stateRepo: IAppointmentStateRepo,
    private readonly messageBus: IMessageBus
  ) {}

  async create(input: {
    insuredId: string;
    scheduleId: number;
    countryISO: "PE" | "CL";
  }): Promise<Appointment> {
    const now = new Date().toISOString();
    const appointment: Appointment = {
      appointmentUuid: randomUUID(),
      insuredId: input.insuredId,
      scheduleId: input.scheduleId,
      countryISO: input.countryISO,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await this.stateRepo.save(appointment);
    await this.messageBus.publish(appointment);
    return appointment;
  }

  listByInsured(insuredId: string): Promise<Appointment[]> {
    return this.stateRepo.listByInsured(insuredId);
  }

  complete(appointmentUuid: string): Promise<void> {
    return this.stateRepo.markCompleted(appointmentUuid);
  }
}
