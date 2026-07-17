import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

process.env.TABLE_APPOINTMENT_EVENTS = "AppointmentEvents";

import { DynamoAppointmentEventStore } from "../src/infra/repos/DynamoAppointmentEventStore";
import type { AppointmentEvent } from "../src/domain/entities/AppointmentEvent";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("DynamoAppointmentEventStore (unit)", () => {
  let store: DynamoAppointmentEventStore;

  beforeEach(() => {
    ddbMock.reset();
    store = new DynamoAppointmentEventStore();
  });

  const event: AppointmentEvent = {
    eventId: "e1",
    appointmentUuid: "u1",
    eventType: "APPOINTMENT_CREATED",
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    status: "pending",
    occurredAt: "2026-01-01T00:00:00.000Z",
  };

  test("append -> PutCommand with a composite sortKey (occurredAt#eventId) for uniqueness", async () => {
    ddbMock.on(PutCommand).resolves({});
    await store.append(event);

    const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(input.TableName).toBe("AppointmentEvents");
    expect(input.Item).toMatchObject(event);
    expect((input.Item as Record<string, unknown>).sortKey).toBe(
      "2026-01-01T00:00:00.000Z#e1"
    );
  });

  test("findByAppointmentId -> queries by partition key, ascending, and strips the internal sortKey", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ ...event, sortKey: "2026-01-01T00:00:00.000Z#e1" }],
    });

    const events = await store.findByAppointmentId("u1");

    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.KeyConditionExpression).toBe("appointmentUuid = :a");
    expect(input.ScanIndexForward).toBe(true);
    expect(events).toEqual([event]);
    expect((events[0] as unknown as Record<string, unknown>).sortKey).toBeUndefined();
  });

  test("findByAppointmentId -> returns an empty array when nothing is found", async () => {
    ddbMock.on(QueryCommand).resolves({});
    expect(await store.findByAppointmentId("missing")).toEqual([]);
  });
});
