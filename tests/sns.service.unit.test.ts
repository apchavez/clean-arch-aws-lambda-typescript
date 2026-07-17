import { mockClient } from "aws-sdk-client-mock";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SnsMessageBus } from "../src/infra/messaging/sns.service";
import type { Appointment } from "../src/domain/entities/Appointment";

const snsMock = mockClient(SNSClient);

describe("SnsMessageBus", () => {
  beforeAll(() => {
    process.env.SNS_APPOINTMENTS_ARN = "arn:aws:sns:us-east-1:111111111111:appointments";
  });

  beforeEach(() => {
    snsMock.reset();
  });

  const appointment: Appointment = {
    appointmentUuid: "u1",
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    status: "pending",
    createdAt: "t",
    updatedAt: "t",
  };

  test("publish -> publishes the appointment with a countryISO message attribute", async () => {
    snsMock.on(PublishCommand).resolves({});
    const bus = new SnsMessageBus();

    await bus.publish(appointment);

    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
    const input = snsMock.commandCalls(PublishCommand)[0].args[0].input;
    expect(input.TopicArn).toBe(process.env.SNS_APPOINTMENTS_ARN);
    expect(JSON.parse(input.Message as string)).toEqual(appointment);
    expect(input.MessageAttributes?.countryISO).toEqual({
      DataType: "String",
      StringValue: "PE",
    });
  });

  test("publish -> propagates errors from the SNS client", async () => {
    snsMock.on(PublishCommand).rejects(new Error("throttled"));
    const bus = new SnsMessageBus();

    await expect(bus.publish(appointment)).rejects.toThrow("throttled");
  });
});
