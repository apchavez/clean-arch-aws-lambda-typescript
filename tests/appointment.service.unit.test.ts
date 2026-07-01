import { mockClient } from "aws-sdk-client-mock";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AppointmentService } from "../src/app/usecases/appointment.service";

const snsMock = mockClient(SNSClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Appointments Service (unit)", () => {
  let svc: AppointmentService;

  beforeAll(async () => {
    process.env.TABLE_APPOINTMENTS = "Appointments";
    process.env.SNS_APPOINTMENTS_ARN =
      "arn:aws:sns:us-east-1:111111111111:appointments";
    const { appointmentMakeService } = await import("../src/index");
    svc = appointmentMakeService();
  });

  beforeEach(() => {
    snsMock.reset();
    ddbMock.reset();
  });

  test('create -> saves "pending" in Dynamo and publishes SNS with countryISO attribute', async () => {
    ddbMock.on(PutCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const out = await svc.create({
      insuredId: "01234",
      scheduleId: 100,
      countryISO: "PE",
    });

    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    const putIn = ddbMock.commandCalls(PutCommand)[0].args[0].input as Record<
      string,
      unknown
    >;
    const item = putIn.Item as Record<string, unknown>;
    expect(putIn.TableName).toBe(process.env.TABLE_APPOINTMENTS);
    expect(item.insuredId).toBe("01234");
    expect(item.scheduleId).toBe(100);
    expect(item.countryISO).toBe("PE");
    expect(item.status).toBe("pending");
    expect(item.createdAt).toBe(item.updatedAt);
    expect(String(putIn.ConditionExpression)).toMatch(
      /attribute_not_exists\s*\(\s*appointmentUuid\s*\)/i
    );

    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
    const pubIn = snsMock.commandCalls(PublishCommand)[0].args[0].input;
    const attrs = pubIn.MessageAttributes as Record<
      string,
      { StringValue: string }
    >;
    expect(attrs?.countryISO?.StringValue).toBe("PE");

    expect(out.status).toBe("pending");
    expect(out.appointmentUuid).toBeTruthy();
  });

  test('complete -> marks status as "completed" and updates updatedAt in Dynamo', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await svc.complete("u1");

    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    const updIn = ddbMock.commandCalls(UpdateCommand)[0].args[0]
      .input as Record<string, unknown>;
    const vals = updIn.ExpressionAttributeValues as Record<string, unknown>;
    expect(updIn.TableName).toBe(process.env.TABLE_APPOINTMENTS);
    expect((updIn.Key as Record<string, unknown>).appointmentUuid).toBe("u1");
    expect(String(updIn.UpdateExpression)).toMatch(/set\s+#status\s*=\s*:c/i);
    expect(String(updIn.UpdateExpression)).toMatch(/updatedAt\s*=\s*:u/i);
    expect(
      (updIn.ExpressionAttributeNames as Record<string, string>)?.["#status"]
    ).toBe("status");
    expect(vals?.[":c"]).toBe("completed");
    expect(typeof vals?.[":u"]).toBe("string");
    expect(String(updIn.ConditionExpression)).toMatch(
      /attribute_exists\s*\(\s*appointmentUuid\s*\)/i
    );
  });

  test("listByInsured -> queries DynamoDB by insuredId using byInsured GSI and returns items", async () => {
    const mockItems = [
      {
        appointmentUuid: "u1",
        insuredId: "01234",
        scheduleId: 100,
        countryISO: "PE",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    ddbMock.on(QueryCommand).resolves({ Items: mockItems });

    const result = await svc.listByInsured("01234");

    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);
    const queryIn = ddbMock.commandCalls(QueryCommand)[0].args[0]
      .input as Record<string, unknown>;
    const vals = queryIn.ExpressionAttributeValues as Record<string, unknown>;
    expect(queryIn.TableName).toBe(process.env.TABLE_APPOINTMENTS);
    expect(queryIn.IndexName).toBe("byInsured");
    expect(String(queryIn.KeyConditionExpression)).toMatch(/insuredId\s*=\s*:a/);
    expect(vals?.[":a"]).toBe("01234");
    expect(result).toEqual(mockItems);
  });
});
