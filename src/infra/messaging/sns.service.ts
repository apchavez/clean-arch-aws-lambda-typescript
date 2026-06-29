import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import type { Appointment } from "../../domain/entities/Appointment";
import type { IMessageBus } from "../../domain/ports/IMessageBus";

export class SnsMessageBus implements IMessageBus {
  private readonly sns = new SNSClient({});
  private readonly topicArn = process.env.SNS_APPOINTMENTS_ARN!;

  async publish(appointment: Appointment): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(appointment),
        MessageAttributes: {
          countryISO: { DataType: "String", StringValue: appointment.countryISO },
        },
      })
    );
  }
}
