import { mockClient } from "aws-sdk-client-mock";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const snsMock = mockClient(SNSClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Appointments Service (unit)", () => {
  let svc: any;

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

  test('create -> save "pending" in Dynamo and publish SNS with country', async () => {
    ddbMock.on(PutCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const out = await svc.create({
      insuredId: "01234",
      scheduleId: 100,
      countryISO: "PE",
    });
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    const putIn = ddbMock.commandCalls(PutCommand)[0].args[0].input as any;
    expect(putIn.TableName).toBe(process.env.TABLE_APPOINTMENTS);
    expect(putIn.Item.insuredId).toBe("01234");
    expect(putIn.Item.scheduleId).toBe(100);
    expect(putIn.Item.countryISO).toBe("PE");
    expect(putIn.Item.status).toBe("pending");
    expect(String(putIn.ConditionExpression)).toMatch(
      /attribute_not_exists\s*\(\s*appointmentUuid\s*\)/i
    );
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
    const pubIn = snsMock.commandCalls(PublishCommand)[0].args[0].input as any;
    if (pubIn.MessageAttributes?.countryISO?.StringValue) {
      expect(pubIn.MessageAttributes.countryISO.StringValue).toBe("PE");
    } else {
      const msg = JSON.parse(pubIn.Message as string);
      expect(msg.countryISO).toBe("PE");
    }
    expect(out.status).toBe("pending");
    expect(out.appointmentUuid).toBeTruthy();
  });

  test('Completed -> Updates the status as "completed" in Dynamo', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await svc.complete("u1");
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    const updIn = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(updIn.TableName).toBe(process.env.TABLE_APPOINTMENTS); // "Appointments"
    expect(updIn.Key.appointmentUuid).toBe("u1");
    expect(String(updIn.UpdateExpression)).toMatch(/set\s+#status\s*=\s*:c/i);
    expect(updIn.ExpressionAttributeNames?.["#status"]).toBe("status");
    expect(updIn.ExpressionAttributeValues?.[":c"]).toBe("completed");
    expect(String(updIn.ConditionExpression)).toMatch(
      /attribute_exists\s*\(\s*appointmentUuid\s*\)/i
    );
  });
});
