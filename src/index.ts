import { AppointmentDynamoRepository } from "./infra/repos/DynamoAppointmentStateRepo";
import { AppointmentRdsRepositoryImpl } from "./infra/repos/MySQLCountryBookingRepo";
import { AppointmentService } from "./app/usecases/appointment.service";

export const appointmentMakeService = () => {
  const dynamo = new AppointmentDynamoRepository();
  const rds = new AppointmentRdsRepositoryImpl();
  return new AppointmentService(dynamo, dynamo, rds);
};
