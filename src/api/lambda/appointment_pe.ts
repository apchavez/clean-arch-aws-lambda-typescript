import type { SQSHandler } from "aws-lambda";
import { appointmentMakeService } from "../../index";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const svc = appointmentMakeService();
const eb = new EventBridgeClient({});

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records ?? []) {
    const raw = JSON.parse(record.body);
    const payload = raw?.Message ? JSON.parse(raw.Message) : raw;
    await svc.writeInRds(payload);
    await eb.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "appointment.pe",
            DetailType: "AppointmentConfirmed",
            Detail: JSON.stringify({
              appointmentUuid: payload.appointmentUuid,
            }),
            EventBusName: process.env.EB_BUS_NAME,
          },
        ],
      })
    );
  }
};
