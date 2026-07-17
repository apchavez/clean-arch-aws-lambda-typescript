import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Appointment } from "../../domain/entities/Appointment";
import type { IAppointmentStateRepo, Page } from "../../domain/ports/IAppointmentStateRepo";
import { ddb } from "../config/ddb";

const TableName = process.env.TABLE_APPOINTMENTS!;

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
}

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

  async findById(appointmentUuid: string): Promise<Appointment | null> {
    const res = await ddb.send(
      new GetCommand({ TableName, Key: { appointmentUuid } })
    );
    return (res.Item as Appointment) ?? null;
  }

  async listByInsured(
    insuredId: string,
    pageSize?: number,
    cursor?: string
  ): Promise<Page<Appointment>> {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        IndexName: "byInsured",
        KeyConditionExpression: "insuredId = :a",
        ExpressionAttributeValues: { ":a": insuredId },
        ScanIndexForward: false,
        Limit: pageSize,
        ExclusiveStartKey: cursor ? decodeCursor(cursor) : undefined,
      })
    );
    return {
      items: (res.Items as Appointment[]) ?? [],
      nextCursor: res.LastEvaluatedKey ? encodeCursor(res.LastEvaluatedKey) : null,
    };
  }

  async markCompleted(appointmentUuid: string): Promise<void> {
    await this.updateStatus(appointmentUuid, "completed");
  }

  async markCancelled(appointmentUuid: string): Promise<void> {
    await this.updateStatus(appointmentUuid, "cancelled");
  }

  async markRescheduled(appointmentUuid: string): Promise<void> {
    await this.updateStatus(appointmentUuid, "rescheduled");
  }

  private async updateStatus(appointmentUuid: string, status: string): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName,
        Key: { appointmentUuid },
        UpdateExpression: "SET #status = :c, updatedAt = :u",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":c": status,
          ":u": new Date().toISOString(),
        },
        ConditionExpression: "attribute_exists(appointmentUuid)",
      })
    );
  }
}
