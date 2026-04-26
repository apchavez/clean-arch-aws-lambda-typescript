import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const eb = new EventBridgeClient({});
const eventBusName = process.env.EB_BUS_NAME!;

type Source = "appointment.pe" | "appointment.cl";
interface ConfirmDetail {
  appointmentUuid: string;
}

export async function sendConfirmation(
  source: Source,
  detail: ConfirmDetail
): Promise<void> {
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: source,
          DetailType: "AppointmentConfirmed",
          Detail: JSON.stringify(detail),
          EventBusName: eventBusName,
        },
      ],
    })
  );
}
