import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Appointment } from "../../domain/entities/Appointment";
import type {
  AppointmentReadRepository,
  AppointmentWriteRepository,
} from "./AppointmentRepo";
import { ddb } from "../config/ddb";

const TableName = process.env.TABLE_APPOINTMENTS!;

export class AppointmentDynamoRepository
  implements AppointmentReadRepository, AppointmentWriteRepository
{
  async save(appointment: Appointment): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName,
        Item: appointment,
        ConditionExpression: "attribute_not_exists(appointmentUuid)",
      })
    );
  }

  async consultByInsuredId(insuredId: string): Promise<Appointment[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        IndexName: "byInsured",
        KeyConditionExpression: "insuredId = :a",
        ExpressionAttributeValues: { ":a": insuredId },
        ScanIndexForward: false,
      })
    );
    return (res.Items as Appointment[]) ?? [];
  }

  async markCompleted(appointmentUuid: string): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName,
        Key: { appointmentUuid },
        UpdateExpression: "SET #status = :c",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":c": "completed" },
        ConditionExpression: "attribute_exists(appointmentUuid)",
      })
    );
  }
}
