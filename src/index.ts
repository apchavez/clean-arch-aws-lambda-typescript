import { DynamoAppointmentStateRepo } from "./infra/repos/DynamoAppointmentStateRepo";
import { DynamoAppointmentEventStore } from "./infra/repos/DynamoAppointmentEventStore";
import { SnsMessageBus } from "./infra/messaging/sns.service";
import { AppointmentService } from "./app/usecases/appointment.service";
import { MySQLCountryBookingRepo } from "./infra/repos/MySQLCountryBookingRepo";
import { EventBridgeConfirmationBus } from "./infra/messaging/eventbridge.service";
import { AppointmentCountryService } from "./app/usecases/appointment-country.service";
import { SesAppointmentNotifier } from "./infra/notifications/SesAppointmentNotifier";
import { NoOpAppointmentNotifier } from "./infra/notifications/NoOpAppointmentNotifier";
import type { IAppointmentNotifier } from "./domain/ports/IAppointmentNotifier";

const makeNotifier = (): IAppointmentNotifier =>
  process.env.SES_SENDER_ADDRESS
    ? new SesAppointmentNotifier()
    : new NoOpAppointmentNotifier();

export const appointmentMakeService = (): AppointmentService =>
  new AppointmentService(
    new DynamoAppointmentStateRepo(),
    new SnsMessageBus(),
    new DynamoAppointmentEventStore(),
    makeNotifier()
  );

export const appointmentCountryMakeService = (): AppointmentCountryService =>
  new AppointmentCountryService(
    new MySQLCountryBookingRepo(),
    new EventBridgeConfirmationBus()
  );
