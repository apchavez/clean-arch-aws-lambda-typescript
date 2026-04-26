import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import type { Appointment } from "../../domain/entities/Appointment";

const sns = new SNSClient({});
const topicArn = process.env.SNS_APPOINTMENTS_ARN!;
export async function publishAppointment(message: Appointment): Promise<void> {
  await sns.send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message),
      MessageAttributes: {
        countryISO: { DataType: "String", StringValue: message.countryISO },
      },
    })
  );
}
