import { randomUUID } from "crypto";
import { AppointmentService } from "../src/app/usecases/appointment.service";
import type { Appointment } from "../src/domain/entities/Appointment";
import type { AppointmentEvent } from "../src/domain/entities/AppointmentEvent";
import type { IAppointmentStateRepo, Page } from "../src/domain/ports/IAppointmentStateRepo";
import type { IAppointmentEventStore } from "../src/domain/ports/IAppointmentEventStore";
import type { IAppointmentNotifier } from "../src/domain/ports/IAppointmentNotifier";
import type { IMessageBus } from "../src/domain/ports/IMessageBus";
import { NotFoundError, ConflictError } from "../src/shared/errors";

class InMemoryStateRepo implements IAppointmentStateRepo {
  store: Appointment[] = [];

  async save(a: Appointment): Promise<void> {
    this.store.push(a);
  }

  async findById(appointmentUuid: string): Promise<Appointment | null> {
    return this.store.find((a) => a.appointmentUuid === appointmentUuid) ?? null;
  }

  async listByInsured(insuredId: string): Promise<Page<Appointment>> {
    return { items: this.store.filter((a) => a.insuredId === insuredId), nextCursor: null };
  }

  async markCompleted(appointmentUuid: string): Promise<void> {
    this.updateStatus(appointmentUuid, "completed");
  }

  async markCancelled(appointmentUuid: string): Promise<void> {
    this.updateStatus(appointmentUuid, "cancelled");
  }

  async markRescheduled(appointmentUuid: string): Promise<void> {
    this.updateStatus(appointmentUuid, "rescheduled");
  }

  private updateStatus(appointmentUuid: string, status: Appointment["status"]): void {
    const a = this.store.find((x) => x.appointmentUuid === appointmentUuid);
    if (a) {
      a.status = status;
      a.updatedAt = new Date().toISOString();
    }
  }
}

class CapturingMessageBus implements IMessageBus {
  published: Appointment[] = [];
  async publish(a: Appointment): Promise<void> {
    this.published.push(a);
  }
}

class InMemoryEventStore implements IAppointmentEventStore {
  events: AppointmentEvent[] = [];
  async append(e: AppointmentEvent): Promise<void> {
    this.events.push(e);
  }
  async findByAppointmentId(appointmentUuid: string): Promise<AppointmentEvent[]> {
    return this.events.filter((e) => e.appointmentUuid === appointmentUuid);
  }
}

class CapturingNotifier implements IAppointmentNotifier {
  completed: Appointment[] = [];
  cancelled: Appointment[] = [];
  rescheduled: { old: Appointment; next: Appointment }[] = [];
  async notifyCompleted(a: Appointment): Promise<void> {
    this.completed.push(a);
  }
  async notifyCancelled(a: Appointment): Promise<void> {
    this.cancelled.push(a);
  }
  async notifyRescheduled(old: Appointment, next: Appointment): Promise<void> {
    this.rescheduled.push({ old, next });
  }
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  const now = new Date().toISOString();
  return {
    appointmentUuid: randomUUID(),
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("AppointmentService (unit)", () => {
  let stateRepo: InMemoryStateRepo;
  let messageBus: CapturingMessageBus;
  let eventStore: InMemoryEventStore;
  let notifier: CapturingNotifier;
  let svc: AppointmentService;

  beforeEach(() => {
    stateRepo = new InMemoryStateRepo();
    messageBus = new CapturingMessageBus();
    eventStore = new InMemoryEventStore();
    notifier = new CapturingNotifier();
    svc = new AppointmentService(stateRepo, messageBus, eventStore, notifier);
  });

  test("create -> saves pending appointment, publishes to the message bus, and appends a CREATED event", async () => {
    const out = await svc.create({ insuredId: "01234", scheduleId: 100, countryISO: "PE" });

    expect(out.status).toBe("pending");
    expect(out.appointmentUuid).toBeTruthy();
    expect(out.createdAt).toBe(out.updatedAt);
    expect(stateRepo.store).toHaveLength(1);
    expect(messageBus.published).toEqual([out]);
    expect(eventStore.events).toHaveLength(1);
    expect(eventStore.events[0].eventType).toBe("APPOINTMENT_CREATED");
  });

  test("create -> passes contactEmail through when provided", async () => {
    const out = await svc.create({
      insuredId: "01234",
      scheduleId: 100,
      countryISO: "PE",
      contactEmail: "insured@example.com",
    });
    expect(out.contactEmail).toBe("insured@example.com");
  });

  test("listByInsured -> delegates to the repo", async () => {
    await stateRepo.save(makeAppointment({ insuredId: "01234" }));
    await stateRepo.save(makeAppointment({ insuredId: "99999" }));

    const page = await svc.listByInsured("01234");
    expect(page.items).toHaveLength(1);
    expect(page.items[0].insuredId).toBe("01234");
  });

  test("getById -> returns null when not found", async () => {
    expect(await svc.getById("missing")).toBeNull();
  });

  test("complete -> marks completed, appends event, and notifies", async () => {
    const appt = makeAppointment({ contactEmail: "insured@example.com" });
    await stateRepo.save(appt);

    await svc.complete(appt.appointmentUuid);

    expect((await stateRepo.findById(appt.appointmentUuid))?.status).toBe("completed");
    expect(eventStore.events.map((e) => e.eventType)).toEqual(["APPOINTMENT_COMPLETED"]);
    expect(notifier.completed).toHaveLength(1);
  });

  test("complete -> no-ops on notifications/events if the appointment vanished after markCompleted", async () => {
    // markCompleted on a nonexistent id is a silent no-op in InMemoryStateRepo (mirrors the real
    // repo's conditional update failing); findById afterwards returns null.
    await svc.complete("missing");
    expect(eventStore.events).toHaveLength(0);
    expect(notifier.completed).toHaveLength(0);
  });

  test("cancel -> marks cancelled, appends event, and notifies", async () => {
    const appt = makeAppointment({ contactEmail: "insured@example.com" });
    await stateRepo.save(appt);

    await svc.cancel(appt.appointmentUuid);

    expect((await stateRepo.findById(appt.appointmentUuid))?.status).toBe("cancelled");
    expect(eventStore.events.map((e) => e.eventType)).toEqual(["APPOINTMENT_CANCELLED"]);
    expect(notifier.cancelled).toHaveLength(1);
    expect(notifier.cancelled[0].status).toBe("cancelled");
  });

  test("cancel -> throws NotFoundError when the appointment does not exist", async () => {
    await expect(svc.cancel("missing")).rejects.toThrow(NotFoundError);
  });

  test("cancel -> throws ConflictError when the appointment isn't pending", async () => {
    const appt = makeAppointment({ status: "completed" });
    await stateRepo.save(appt);
    await expect(svc.cancel(appt.appointmentUuid)).rejects.toThrow(ConflictError);
  });

  test("reschedule -> marks old rescheduled, creates a new pending appointment, publishes it, and notifies", async () => {
    const old = makeAppointment({ contactEmail: "insured@example.com", scheduleId: 100 });
    await stateRepo.save(old);

    const next = await svc.reschedule(old.appointmentUuid, 200);

    expect(next.appointmentUuid).not.toBe(old.appointmentUuid);
    expect(next.status).toBe("pending");
    expect(next.scheduleId).toBe(200);
    expect(next.insuredId).toBe(old.insuredId);
    expect(next.contactEmail).toBe(old.contactEmail);

    expect((await stateRepo.findById(old.appointmentUuid))?.status).toBe("rescheduled");
    expect(stateRepo.store.find((a) => a.appointmentUuid === next.appointmentUuid)).toBeTruthy();
    expect(messageBus.published).toEqual([next]);
    expect(eventStore.events.map((e) => e.eventType)).toEqual([
      "APPOINTMENT_RESCHEDULED",
      "APPOINTMENT_CREATED",
    ]);
    expect(notifier.rescheduled).toHaveLength(1);
    expect(notifier.rescheduled[0].next.appointmentUuid).toBe(next.appointmentUuid);
  });

  test("reschedule -> throws NotFoundError when the appointment does not exist", async () => {
    await expect(svc.reschedule("missing", 42)).rejects.toThrow(NotFoundError);
  });

  test("reschedule -> throws ConflictError when the appointment isn't pending", async () => {
    const appt = makeAppointment({ status: "cancelled" });
    await stateRepo.save(appt);
    await expect(svc.reschedule(appt.appointmentUuid, 42)).rejects.toThrow(ConflictError);
  });

  test("getHistory -> delegates to the event store", async () => {
    const created = await svc.create({ insuredId: "01234", scheduleId: 100, countryISO: "PE" });
    await svc.cancel(created.appointmentUuid);

    const events = await svc.getHistory(created.appointmentUuid);
    expect(events.map((e) => e.eventType)).toEqual([
      "APPOINTMENT_CREATED",
      "APPOINTMENT_CANCELLED",
    ]);
  });
});
