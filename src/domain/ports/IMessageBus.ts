import { Appointment } from "../entities/Appointment";

export interface IMessageBus {
  publish(appointment: Appointment): Promise<void>;
}
