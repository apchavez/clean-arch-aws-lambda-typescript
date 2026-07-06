import { AppointmentCountryService } from "../src/app/usecases/appointment-country.service";
import { MySQLCountryBookingRepo } from "../src/infra/repos/MySQLCountryBookingRepo";
import { EventBridgeConfirmationBus } from "../src/infra/messaging/eventbridge.service";

describe("appointmentCountryMakeService", () => {
  beforeAll(() => {
    process.env.EB_BUS_NAME = "appointments-bus";
  });

  test("wires a MySQLCountryBookingRepo and EventBridgeConfirmationBus into an AppointmentCountryService", async () => {
    const { appointmentCountryMakeService } = await import("../src/index");

    const svc = appointmentCountryMakeService();

    expect(svc).toBeInstanceOf(AppointmentCountryService);
    expect((svc as unknown as { bookingRepo: unknown }).bookingRepo).toBeInstanceOf(
      MySQLCountryBookingRepo
    );
    expect(
      (svc as unknown as { confirmationBus: unknown }).confirmationBus
    ).toBeInstanceOf(EventBridgeConfirmationBus);
  });
});
