import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { AppointmentEvent } from "../../domain/entities/AppointmentEvent";
import type { IAppointmentEventStore } from "../../domain/ports/IAppointmentEventStore";
import { ddb } from "../config/ddb";

const TableName = process.env.TABLE_APPOINTMENT_EVENTS!;

export class DynamoAppointmentEventStore implements IAppointmentEventStore {
  async append(event: AppointmentEvent): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName,
        // occurredAt alone isn't guaranteed unique as a sort key (two events could land in the
        // same millisecond); appending eventId keeps chronological ordering (ISO timestamp sorts
        // lexicographically) while guaranteeing no event silently overwrites another.
        Item: { ...event, sortKey: `${event.occurredAt}#${event.eventId}` },
      })
    );
  }

  async findByAppointmentId(appointmentUuid: string): Promise<AppointmentEvent[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "appointmentUuid = :a",
        ExpressionAttributeValues: { ":a": appointmentUuid },
        ScanIndexForward: true,
      })
    );
    return (res.Items ?? []).map((item) => ({
      eventId: item.eventId,
      appointmentUuid: item.appointmentUuid,
      eventType: item.eventType,
      insuredId: item.insuredId,
      scheduleId: item.scheduleId,
      countryISO: item.countryISO,
      status: item.status,
      occurredAt: item.occurredAt,
    }));
  }
}
