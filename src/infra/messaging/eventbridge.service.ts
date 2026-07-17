import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { IConfirmationBus } from "../../domain/ports/IConfirmationBus";
import type { EventSource } from "../../domain/types";
import { captureAWSClient } from "../tracing";
import { withResilience } from "../../shared/resilience";

export class EventBridgeConfirmationBus implements IConfirmationBus {
  private readonly eb = captureAWSClient(new EventBridgeClient({}));
  private readonly eventBusName = process.env.EB_BUS_NAME!;
  private readonly resilient = withResilience("eventbridge-publish");

  async send(source: EventSource, appointmentUuid: string): Promise<void> {
    await this.resilient(() =>
      this.eb.send(
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
      )
    );
  }
}
