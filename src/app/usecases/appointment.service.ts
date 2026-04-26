import { randomUUID } from "crypto";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { Appointment } from "../../domain/entities/Appointment";
import type {
  AppointmentReadRepository,
  AppointmentWriteRepository,
  AppointmentRdsRepository,
} from "../../infra/repos/AppointmentRepo";

export class AppointmentService {
  constructor(
    private readonly lectura: AppointmentReadRepository,
    private readonly write: AppointmentWriteRepository,
    private readonly rds: AppointmentRdsRepository,
    private readonly sns = new SNSClient({})
  ) {}

  async create(input: {
    insuredId: string;
    scheduleId: number;
    countryISO: "PE" | "CL";
  }): Promise<Appointment> {
    const appointment: Appointment = {
      appointmentUuid: randomUUID(),
      insuredId: input.insuredId,
      scheduleId: input.scheduleId,
      countryISO: input.countryISO,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.write.save(appointment);

    await this.sns.send(
      new PublishCommand({
        TopicArn: process.env.SNS_APPOINTMENTS_ARN!,
        Message: JSON.stringify(appointment),
        MessageAttributes: {
          countryISO: {
            DataType: "String",
            StringValue: appointment.countryISO,
          },
        },
      })
    );

    return appointment;
  }

  listByInsured(insuredId: string): Promise<Appointment[]> {
    return this.lectura.consultByInsuredId(insuredId);
  }

  complete(appointmentUuid: string): Promise<void> {
    return this.write.markCompleted(appointmentUuid);
  }

  writeInRds(appointment: Appointment): Promise<void> {
    return this.rds.writeByCountry(appointment);
  }
}
