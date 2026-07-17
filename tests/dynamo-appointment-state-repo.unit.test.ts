import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

process.env.TABLE_APPOINTMENTS = "Appointments";

import { DynamoAppointmentStateRepo } from "../src/infra/repos/DynamoAppointmentStateRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("DynamoAppointmentStateRepo (unit)", () => {
  let repo: DynamoAppointmentStateRepo;

  beforeEach(() => {
    ddbMock.reset();
    repo = new DynamoAppointmentStateRepo();
  });

  test("save -> PutCommand with attribute_not_exists condition", async () => {
    ddbMock.on(PutCommand).resolves({});
    const appt = {
      appointmentUuid: "u1",
      insuredId: "01234",
      scheduleId: 100,
      countryISO: "PE" as const,
      status: "pending" as const,
      createdAt: "t",
      updatedAt: "t",
    };
    await repo.save(appt);

    const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(input.TableName).toBe("Appointments");
    expect(input.Item).toEqual(appt);
    expect(String(input.ConditionExpression)).toMatch(/attribute_not_exists\(appointmentUuid\)/);
  });

  test("findById -> returns the item when found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { appointmentUuid: "u1", status: "pending" } });
    const result = await repo.findById("u1");
    expect(result).toEqual({ appointmentUuid: "u1", status: "pending" });
    expect(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({ appointmentUuid: "u1" });
  });

  test("findById -> returns null when not found", async () => {
    ddbMock.on(GetCommand).resolves({});
    expect(await repo.findById("missing")).toBeNull();
  });

  test("listByInsured -> queries the byInsured GSI with pageSize as Limit", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ appointmentUuid: "u1" }] });
    const page = await repo.listByInsured("01234", 5);

    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.IndexName).toBe("byInsured");
    expect(input.Limit).toBe(5);
    expect(input.ExclusiveStartKey).toBeUndefined();
    expect(page.items).toEqual([{ appointmentUuid: "u1" }]);
    expect(page.nextCursor).toBeNull();
  });

  test("listByInsured -> decodes an incoming cursor into ExclusiveStartKey", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const cursor = Buffer.from(JSON.stringify({ appointmentUuid: "u1" })).toString("base64url");

    await repo.listByInsured("01234", 20, cursor);

    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ExclusiveStartKey).toEqual({ appointmentUuid: "u1" });
  });

  test("listByInsured -> encodes LastEvaluatedKey as an opaque nextCursor", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [],
      LastEvaluatedKey: { appointmentUuid: "u2", insuredId: "01234" },
    });

    const page = await repo.listByInsured("01234");

    expect(page.nextCursor).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString("utf8"));
    expect(decoded).toEqual({ appointmentUuid: "u2", insuredId: "01234" });
  });

  test.each([
    ["markCompleted", "completed"],
    ["markCancelled", "cancelled"],
    ["markRescheduled", "rescheduled"],
  ] as const)("%s -> UpdateCommand sets status to %s", async (method, expectedStatus) => {
    ddbMock.on(UpdateCommand).resolves({});
    await repo[method]("u1");

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ appointmentUuid: "u1" });
    expect(String(input.UpdateExpression)).toMatch(/SET #status = :c, updatedAt = :u/);
    expect((input.ExpressionAttributeValues as Record<string, unknown>)[":c"]).toBe(expectedStatus);
    expect(String(input.ConditionExpression)).toMatch(/attribute_exists\(appointmentUuid\)/);
  });
});
