import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Appointment } from "../../domain/entities/Appointment";
import type { IAppointmentStateRepo } from "../../domain/ports/IAppointmentStateRepo";
import { ddb } from "../config/ddb";

const TableName = process.env.TABLE_APPOINTMENTS!;

export class DynamoAppointmentStateRepo implements IAppointmentStateRepo {
  async save(appointment: Appointment): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName,
        Item: appointment,
        ConditionExpression: "attribute_not_exists(appointmentUuid)",
      })
    );
  }

  async listByInsured(insuredId: string): Promise<Appointment[]> {
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
        UpdateExpression: "SET #status = :c, updatedAt = :u",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":c": "completed",
          ":u": new Date().toISOString(),
        },
        ConditionExpression: "attribute_exists(appointmentUuid)",
      })
    );
  }
}
