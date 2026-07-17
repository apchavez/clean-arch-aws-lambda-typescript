import { CountryISO, Status } from "../types";

export interface Appointment {
  appointmentUuid: string;
  insuredId: string;
  scheduleId: number;
  countryISO: CountryISO;
  status: Status;
  createdAt: string;
  updatedAt: string;
  contactEmail?: string;
}
