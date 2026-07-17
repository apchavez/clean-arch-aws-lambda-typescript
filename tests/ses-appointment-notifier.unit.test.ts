import { mockClient } from "aws-sdk-client-mock";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

process.env.SES_SENDER_ADDRESS = "no-reply@example.com";

import { SesAppointmentNotifier } from "../src/infra/notifications/SesAppointmentNotifier";
import { NoOpAppointmentNotifier } from "../src/infra/notifications/NoOpAppointmentNotifier";
import type { Appointment } from "../src/domain/entities/Appointment";

const sesMock = mockClient(SESv2Client);

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    appointmentUuid: "u1",
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    status: "pending",
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  };
}

describe("SesAppointmentNotifier (unit)", () => {
  let notifier: SesAppointmentNotifier;

  beforeEach(() => {
    sesMock.reset();
    jest.spyOn(console, "log").mockImplementation(() => {});
    notifier = new SesAppointmentNotifier();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("notifyCompleted -> sends an email when contactEmail is set", async () => {
    sesMock.on(SendEmailCommand).resolves({});
    await notifier.notifyCompleted(makeAppointment({ contactEmail: "insured@example.com" }));

    const input = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.FromEmailAddress).toBe("no-reply@example.com");
    expect(input.Destination?.ToAddresses).toEqual(["insured@example.com"]);
    expect(input.Content?.Simple?.Subject?.Data).toMatch(/confirmed/);
  });

  test("notifyCompleted -> skips silently when contactEmail is absent", async () => {
    sesMock.on(SendEmailCommand).resolves({});
    await notifier.notifyCompleted(makeAppointment({ contactEmail: undefined }));
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test("notifyCancelled -> sends an email when contactEmail is set", async () => {
    sesMock.on(SendEmailCommand).resolves({});
    await notifier.notifyCancelled(makeAppointment({ contactEmail: "insured@example.com" }));

    const input = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Content?.Simple?.Subject?.Data).toMatch(/cancelled/);
  });

  test("notifyRescheduled -> uses the OLD appointment's contactEmail and references the new one", async () => {
    sesMock.on(SendEmailCommand).resolves({});
    const old = makeAppointment({ contactEmail: "insured@example.com" });
    const next = makeAppointment({ appointmentUuid: "u2", scheduleId: 200 });

    await notifier.notifyRescheduled(old, next);

    const input = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Destination?.ToAddresses).toEqual(["insured@example.com"]);
    expect(input.Content?.Simple?.Body?.Text?.Data).toMatch(/u2/);
  });

  test("notifyRescheduled -> skips silently when the old appointment has no contactEmail", async () => {
    sesMock.on(SendEmailCommand).resolves({});
    await notifier.notifyRescheduled(makeAppointment(), makeAppointment({ appointmentUuid: "u2" }));
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test("send failures are swallowed (best-effort) and never thrown", async () => {
    sesMock.on(SendEmailCommand).rejects(new Error("SES unavailable"));
    await expect(
      notifier.notifyCancelled(makeAppointment({ contactEmail: "insured@example.com" }))
    ).resolves.toBeUndefined();
  });
});

describe("NoOpAppointmentNotifier (unit)", () => {
  test("all methods resolve without doing anything", async () => {
    const notifier = new NoOpAppointmentNotifier();
    await expect(notifier.notifyCompleted(makeAppointment())).resolves.toBeUndefined();
    await expect(notifier.notifyCancelled(makeAppointment())).resolves.toBeUndefined();
    await expect(
      notifier.notifyRescheduled(makeAppointment(), makeAppointment())
    ).resolves.toBeUndefined();
  });
});
