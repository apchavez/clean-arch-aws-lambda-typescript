import { randomUUID } from "crypto";
import type { Appointment } from "../../domain/entities/Appointment";
import { makeAppointmentEvent, AppointmentEvent } from "../../domain/entities/AppointmentEvent";
import type { IAppointmentStateRepo, Page } from "../../domain/ports/IAppointmentStateRepo";
import type { IAppointmentEventStore } from "../../domain/ports/IAppointmentEventStore";
import type { IAppointmentNotifier } from "../../domain/ports/IAppointmentNotifier";
import type { IMessageBus } from "../../domain/ports/IMessageBus";
import { NotFoundError, ConflictError } from "../../shared/errors";

export class AppointmentService {
  constructor(
    private readonly stateRepo: IAppointmentStateRepo,
    private readonly messageBus: IMessageBus,
    private readonly eventStore: IAppointmentEventStore,
    private readonly notifier: IAppointmentNotifier
  ) {}

  async create(input: {
    insuredId: string;
    scheduleId: number;
    countryISO: "PE" | "CL";
    contactEmail?: string;
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
      contactEmail: input.contactEmail,
    };
    await this.stateRepo.save(appointment);
    await this.messageBus.publish(appointment);
    await this.eventStore.append(makeAppointmentEvent("APPOINTMENT_CREATED", appointment));
    return appointment;
  }

  listByInsured(
    insuredId: string,
    pageSize?: number,
    cursor?: string
  ): Promise<Page<Appointment>> {
    return this.stateRepo.listByInsured(insuredId, pageSize, cursor);
  }

  getById(appointmentUuid: string): Promise<Appointment | null> {
    return this.stateRepo.findById(appointmentUuid);
  }

  getHistory(appointmentUuid: string): Promise<AppointmentEvent[]> {
    return this.eventStore.findByAppointmentId(appointmentUuid);
  }

  async complete(appointmentUuid: string): Promise<void> {
    await this.stateRepo.markCompleted(appointmentUuid);
    const appointment = await this.stateRepo.findById(appointmentUuid);
    if (!appointment) return;
    await this.eventStore.append(makeAppointmentEvent("APPOINTMENT_COMPLETED", appointment));
    await this.notifier.notifyCompleted(appointment);
  }

  async cancel(appointmentUuid: string): Promise<void> {
    const appointment = await this.requirePending(appointmentUuid, "cancelled");
    await this.stateRepo.markCancelled(appointmentUuid);
    const updated: Appointment = {
      ...appointment,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };
    await this.eventStore.append(makeAppointmentEvent("APPOINTMENT_CANCELLED", updated));
    await this.notifier.notifyCancelled(updated);
  }

  async reschedule(appointmentUuid: string, newScheduleId: number): Promise<Appointment> {
    const old = await this.requirePending(appointmentUuid, "rescheduled");
    await this.stateRepo.markRescheduled(appointmentUuid);
    const rescheduledOld: Appointment = {
      ...old,
      status: "rescheduled",
      updatedAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    const newAppointment: Appointment = {
      appointmentUuid: randomUUID(),
      insuredId: old.insuredId,
      scheduleId: newScheduleId,
      countryISO: old.countryISO,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      contactEmail: old.contactEmail,
    };
    await this.stateRepo.save(newAppointment);
    await this.messageBus.publish(newAppointment);

    await this.eventStore.append(
      makeAppointmentEvent("APPOINTMENT_RESCHEDULED", rescheduledOld)
    );
    await this.eventStore.append(makeAppointmentEvent("APPOINTMENT_CREATED", newAppointment));
    await this.notifier.notifyRescheduled(rescheduledOld, newAppointment);

    return newAppointment;
  }

  private async requirePending(
    appointmentUuid: string,
    action: "cancelled" | "rescheduled"
  ): Promise<Appointment> {
    const appointment = await this.stateRepo.findById(appointmentUuid);
    if (!appointment) {
      throw new NotFoundError(`Appointment not found: ${appointmentUuid}`);
    }
    if (appointment.status !== "pending") {
      throw new ConflictError(`Only a PENDING appointment can be ${action}`);
    }
    return appointment;
  }
}
