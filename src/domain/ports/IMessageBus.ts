export interface IMessageBus {
  publishAppointmentRequested(payload: {
    appointmentUuid: string;
    insuredId: string;
    scheduleId: number;
    countryISO: "PE" | "CL";
  }): Promise<void>;

  publishAppointmentCompleted(payload: {
    appointmentUuid: string;
    insuredId: string;
    countryISO: "PE" | "CL";
  }): Promise<void>;
}
