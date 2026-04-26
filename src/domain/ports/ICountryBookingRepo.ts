import { Appointment } from "../entities/Appointment";
import { ScheduleDetail } from "../entities/ScheduleDetail";

export type CountryBookingInput = Appointment & ScheduleDetail;

export interface ICountryBookingRepo {
  book(input: CountryBookingInput): Promise<void>;
}
