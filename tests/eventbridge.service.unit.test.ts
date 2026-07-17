import { mockClient } from "aws-sdk-client-mock";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { EventBridgeConfirmationBus } from "../src/infra/messaging/eventbridge.service";

const ebMock = mockClient(EventBridgeClient);

describe("EventBridgeConfirmationBus", () => {
  beforeAll(() => {
    process.env.EB_BUS_NAME = "appointments-bus";
  });

  beforeEach(() => {
    ebMock.reset();
  });

  test("send -> publishes an AppointmentConfirmed event with the given source and detail", async () => {
    ebMock.on(PutEventsCommand).resolves({});
    const bus = new EventBridgeConfirmationBus();

    await bus.send("appointment.pe", "u1");

    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(1);
    const input = ebMock.commandCalls(PutEventsCommand)[0].args[0].input;
    const entry = input.Entries?.[0];
    expect(entry?.Source).toBe("appointment.pe");
    expect(entry?.DetailType).toBe("AppointmentConfirmed");
    expect(entry?.EventBusName).toBe("appointments-bus");
    expect(JSON.parse(entry?.Detail as string)).toEqual({
      appointmentUuid: "u1",
    });
  });

  test("send -> propagates errors from the EventBridge client", async () => {
    ebMock.on(PutEventsCommand).rejects(new Error("throttled"));
    const bus = new EventBridgeConfirmationBus();

    await expect(bus.send("appointment.cl", "u2")).rejects.toThrow(
      "throttled"
    );
  });
});
