import { DynamoAppointmentStateRepo } from "./infra/repos/DynamoAppointmentStateRepo";
import { SnsMessageBus } from "./infra/messaging/sns.service";
import { AppointmentService } from "./app/usecases/appointment.service";
import { MySQLCountryBookingRepo } from "./infra/repos/MySQLCountryBookingRepo";
import { EventBridgeConfirmationBus } from "./infra/messaging/eventbridge.service";
import { AppointmentCountryService } from "./app/usecases/appointment-country.service";

export const appointmentMakeService = (): AppointmentService =>
  new AppointmentService(
    new DynamoAppointmentStateRepo(),
    new SnsMessageBus()
  );

export const appointmentCountryMakeService = (): AppointmentCountryService =>
  new AppointmentCountryService(
    new MySQLCountryBookingRepo(),
    new EventBridgeConfirmationBus()
  );
