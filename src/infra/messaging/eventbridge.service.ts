import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { IConfirmationBus } from "../../domain/ports/IConfirmationBus";
import type { EventSource } from "../../domain/types";

export class EventBridgeConfirmationBus implements IConfirmationBus {
  private readonly eb = new EventBridgeClient({});
  private readonly eventBusName = process.env.EB_BUS_NAME!;

  async send(source: EventSource, appointmentUuid: string): Promise<void> {
    await this.eb.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: source,
            DetailType: "AppointmentConfirmed",
            Detail: JSON.stringify({ appointmentUuid }),
            EventBusName: this.eventBusName,
          },
        ],
      })
    );
  }
}
