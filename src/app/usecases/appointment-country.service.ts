import type { Appointment } from "../../domain/entities/Appointment";
import type { ICountryBookingRepo } from "../../domain/ports/ICountryBookingRepo";
import type { IConfirmationBus } from "../../domain/ports/IConfirmationBus";
import type { EventSource } from "../../domain/types";

export class AppointmentCountryService {
  constructor(
    private readonly bookingRepo: ICountryBookingRepo,
    private readonly confirmationBus: IConfirmationBus
  ) {}

  async process(source: EventSource, appointment: Appointment): Promise<void> {
    await this.bookingRepo.book(appointment);
    await this.confirmationBus.send(source, appointment.appointmentUuid);
  }
}
