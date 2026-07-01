import { Appointment } from "../entities/Appointment";

export interface ICountryBookingRepo {
  book(appointment: Appointment): Promise<void>;
}
