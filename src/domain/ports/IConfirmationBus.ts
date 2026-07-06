import type { EventSource } from "../types";

export interface IConfirmationBus {
  send(source: EventSource, appointmentUuid: string): Promise<void>;
}
