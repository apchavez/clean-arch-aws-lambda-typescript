import { NotFoundError, ConflictError } from "../src/shared/errors";

const create = jest.fn();
const listByInsured = jest.fn();
const complete = jest.fn();
const getById = jest.fn();
const cancel = jest.fn();
const reschedule = jest.fn();
const getHistory = jest.fn();
jest.mock("../src/index", () => ({
  __esModule: true,
  appointmentMakeService: () => ({
    create,
    listByInsured,
    complete,
    getById,
    cancel,
    reschedule,
    getHistory,
  }),
  appointmentCountryMakeService: () => ({}),
}));

import * as handler from "../src/api/lambda/appointment";

const json = (r: { body?: string }) =>
  JSON.parse(r?.body ?? "{}") as Record<string, unknown>;

const agentCtx = { sub: "agent-001", role: "agent" };
const insuredCtx = { sub: "01234", role: "insured" };

function withAuth(
  event: object,
  auth?: { sub: string; role: string }
): never {
  return {
    ...event,
    requestContext: auth ? { authorizer: { lambda: auth } } : {},
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── createAppointment — validation (runs before auth check) ─────────────────

test("POST /appointments -> 400 if no body", async () => {
  const res = await handler.createAppointment({ body: null } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("Required body");
});

test("POST /appointments -> 400 if malformed JSON body", async () => {
  const res = await handler.createAppointment({ body: "not-json" } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("Invalid body (JSON)");
});

test("POST /appointments -> 400 if required fields are missing", async () => {
  const res = await handler.createAppointment({ body: "{}" } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe(
    "insuredId, scheduleId and countryISO are required"
  );
});

test("POST /appointments -> 400 if insuredId format is invalid", async () => {
  const res = await handler.createAppointment({
    body: JSON.stringify({ insuredId: "1234", scheduleId: 1, countryISO: "PE" }),
  } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("insuredId must be 5 digits");
});

test("POST /appointments -> 400 if countryISO is invalid", async () => {
  const res = await handler.createAppointment({
    body: JSON.stringify({ insuredId: "01234", scheduleId: 1, countryISO: "XX" }),
  } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("countryISO must be 'PE' or 'CL'");
});

test("POST /appointments -> 400 if scheduleId is non-numeric", async () => {
  const res = await handler.createAppointment({
    body: JSON.stringify({ insuredId: "01234", scheduleId: "abc", countryISO: "PE" }),
  } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("scheduleId must be a positive integer");
});

test("POST /appointments -> 400 if scheduleId is zero or negative", async () => {
  const res = await handler.createAppointment({
    body: JSON.stringify({ insuredId: "01234", scheduleId: 0, countryISO: "PE" }),
  } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("scheduleId must be a positive integer");
});

// ─── createAppointment — RBAC ────────────────────────────────────────────────

test("POST /appointments -> 403 when no auth context", async () => {
  const res = await handler.createAppointment(
    withAuth({ body: JSON.stringify({ insuredId: "01234", scheduleId: 1, countryISO: "PE" }) })
  );
  expect(res.statusCode).toBe(403);
});

test("POST /appointments -> 403 when insured tries to book for another insured", async () => {
  const res = await handler.createAppointment(
    withAuth(
      { body: JSON.stringify({ insuredId: "99999", scheduleId: 1, countryISO: "PE" }) },
      insuredCtx
    )
  );
  expect(res.statusCode).toBe(403);
  expect(json(res).message).toMatch(/themselves/);
});

test("POST /appointments -> 201 when agent books for any insured", async () => {
  create.mockResolvedValue({ appointmentUuid: "u1", status: "pending" });
  const res = await handler.createAppointment(
    withAuth(
      { body: JSON.stringify({ insuredId: "01234", scheduleId: 100, countryISO: "PE" }) },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(201);
  expect(create).toHaveBeenCalledWith({
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    contactEmail: undefined,
  });
});

test("POST /appointments -> 201 with contactEmail passed through", async () => {
  create.mockResolvedValue({ appointmentUuid: "u1", status: "pending" });
  const res = await handler.createAppointment(
    withAuth(
      {
        body: JSON.stringify({
          insuredId: "01234",
          scheduleId: 100,
          countryISO: "PE",
          contactEmail: "insured@example.com",
        }),
      },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(201);
  expect(create).toHaveBeenCalledWith({
    insuredId: "01234",
    scheduleId: 100,
    countryISO: "PE",
    contactEmail: "insured@example.com",
  });
});

test("POST /appointments -> 201 when insured books their own appointment", async () => {
  create.mockResolvedValue({ appointmentUuid: "u1", status: "pending" });
  const res = await handler.createAppointment(
    withAuth(
      { body: JSON.stringify({ insuredId: "01234", scheduleId: 100, countryISO: "PE" }) },
      insuredCtx
    )
  );
  expect(res.statusCode).toBe(201);
});

test("POST /appointments -> 500 on unexpected service error", async () => {
  create.mockRejectedValue(new Error("DynamoDB throttled"));
  const res = await handler.createAppointment(
    withAuth(
      { body: JSON.stringify({ insuredId: "01234", scheduleId: 100, countryISO: "PE" }) },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(500);
});

// ─── listByInsured — validation ───────────────────────────────────────────────

test("GET /appointments/{insuredId} -> 400 if insuredId missing", async () => {
  const res = await handler.listByInsured({ pathParameters: null } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("insuredId required");
});

test("GET /appointments/{insuredId} -> 400 if insuredId format is invalid", async () => {
  const res = await handler.listByInsured({
    pathParameters: { insuredId: "1234" },
  } as never);
  expect(res.statusCode).toBe(400);
  expect(json(res).message).toBe("insuredId must be 5 digits");
});

// ─── listByInsured — RBAC ────────────────────────────────────────────────────

test("GET /appointments/{insuredId} -> 403 when no auth context", async () => {
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" } })
  );
  expect(res.statusCode).toBe(403);
});

test("GET /appointments/{insuredId} -> 403 when insured accesses another's appointments", async () => {
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "99999" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(403);
  expect(json(res).message).toMatch(/own/);
});

test("GET /appointments/{insuredId} -> 200 when agent lists any insured, default pagination", async () => {
  listByInsured.mockResolvedValue({ items: [{ appointmentUuid: "u1", status: "pending" }], nextCursor: null });
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" }, queryStringParameters: null }, agentCtx)
  );
  expect(res.statusCode).toBe(200);
  expect(listByInsured).toHaveBeenCalledWith("01234", 20, undefined);
  expect(json(res)).toEqual({ items: [{ appointmentUuid: "u1", status: "pending" }], nextCursor: null });
});

test("GET /appointments/{insuredId} -> passes pageSize/cursor query params through", async () => {
  listByInsured.mockResolvedValue({ items: [], nextCursor: "abc123" });
  const res = await handler.listByInsured(
    withAuth(
      {
        pathParameters: { insuredId: "01234" },
        queryStringParameters: { pageSize: "5", cursor: "xyz" },
      },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(200);
  expect(listByInsured).toHaveBeenCalledWith("01234", 5, "xyz");
});

test("GET /appointments/{insuredId} -> invalid pageSize falls back to default", async () => {
  listByInsured.mockResolvedValue({ items: [], nextCursor: null });
  await handler.listByInsured(
    withAuth(
      { pathParameters: { insuredId: "01234" }, queryStringParameters: { pageSize: "not-a-number" } },
      agentCtx
    )
  );
  expect(listByInsured).toHaveBeenCalledWith("01234", 20, undefined);
});

test("GET /appointments/{insuredId} -> pageSize over max falls back to default", async () => {
  listByInsured.mockResolvedValue({ items: [], nextCursor: null });
  await handler.listByInsured(
    withAuth(
      { pathParameters: { insuredId: "01234" }, queryStringParameters: { pageSize: "1000" } },
      agentCtx
    )
  );
  expect(listByInsured).toHaveBeenCalledWith("01234", 20, undefined);
});

test("GET /appointments/{insuredId} -> 200 when insured lists their own appointments", async () => {
  listByInsured.mockResolvedValue({ items: [], nextCursor: null });
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" }, queryStringParameters: null }, insuredCtx)
  );
  expect(res.statusCode).toBe(200);
});

test("GET /appointments/{insuredId} -> 500 on unexpected service error", async () => {
  listByInsured.mockRejectedValue(new Error("DynamoDB unavailable"));
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" }, queryStringParameters: null }, agentCtx)
  );
  expect(res.statusCode).toBe(500);
});

// ─── cancelAppointment ────────────────────────────────────────────────────────

test("DELETE /appointments/{appointmentUuid} -> 400 if appointmentUuid missing", async () => {
  const res = await handler.cancelAppointment({ pathParameters: null } as never);
  expect(res.statusCode).toBe(400);
});

test("DELETE /appointments/{appointmentUuid} -> 403 when no auth context", async () => {
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } })
  );
  expect(res.statusCode).toBe(403);
});

test("DELETE /appointments/{appointmentUuid} -> 404 when appointment does not exist", async () => {
  getById.mockResolvedValue(null);
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "missing" } }, agentCtx)
  );
  expect(res.statusCode).toBe(404);
  expect(cancel).not.toHaveBeenCalled();
});

test("DELETE /appointments/{appointmentUuid} -> 403 when insured cancels someone else's appointment", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "99999" });
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(403);
  expect(cancel).not.toHaveBeenCalled();
});

test("DELETE /appointments/{appointmentUuid} -> 200 when insured cancels their own appointment", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  cancel.mockResolvedValue(undefined);
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(200);
  expect(cancel).toHaveBeenCalledWith("u1");
});

test("DELETE /appointments/{appointmentUuid} -> 409 when use case rejects a non-pending appointment", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  cancel.mockRejectedValue(new ConflictError("Only a PENDING appointment can be cancelled"));
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, agentCtx)
  );
  expect(res.statusCode).toBe(409);
});

test("DELETE /appointments/{appointmentUuid} -> 404 when use case throws NotFoundError", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  cancel.mockRejectedValue(new NotFoundError("Appointment not found: u1"));
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, agentCtx)
  );
  expect(res.statusCode).toBe(404);
});

test("DELETE /appointments/{appointmentUuid} -> 500 on unexpected error", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  cancel.mockRejectedValue(new Error("SNS unavailable"));
  const res = await handler.cancelAppointment(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, agentCtx)
  );
  expect(res.statusCode).toBe(500);
});

// ─── rescheduleAppointment ────────────────────────────────────────────────────

test("PATCH .../reschedule -> 400 if appointmentUuid missing", async () => {
  const res = await handler.rescheduleAppointment({ pathParameters: null } as never);
  expect(res.statusCode).toBe(400);
});

test("PATCH .../reschedule -> 400 if body missing/invalid", async () => {
  const res = await handler.rescheduleAppointment({
    pathParameters: { appointmentUuid: "u1" },
    body: null,
  } as never);
  expect(res.statusCode).toBe(400);
});

test("PATCH .../reschedule -> 400 if newScheduleId invalid", async () => {
  const res = await handler.rescheduleAppointment({
    pathParameters: { appointmentUuid: "u1" },
    body: JSON.stringify({ newScheduleId: 0 }),
  } as never);
  expect(res.statusCode).toBe(400);
});

test("PATCH .../reschedule -> 403 when no auth context", async () => {
  const res = await handler.rescheduleAppointment(
    withAuth({
      pathParameters: { appointmentUuid: "u1" },
      body: JSON.stringify({ newScheduleId: 42 }),
    })
  );
  expect(res.statusCode).toBe(403);
});

test("PATCH .../reschedule -> 404 when appointment does not exist", async () => {
  getById.mockResolvedValue(null);
  const res = await handler.rescheduleAppointment(
    withAuth(
      { pathParameters: { appointmentUuid: "missing" }, body: JSON.stringify({ newScheduleId: 42 }) },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(404);
  expect(reschedule).not.toHaveBeenCalled();
});

test("PATCH .../reschedule -> 403 when insured reschedules someone else's appointment", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "99999" });
  const res = await handler.rescheduleAppointment(
    withAuth(
      { pathParameters: { appointmentUuid: "u1" }, body: JSON.stringify({ newScheduleId: 42 }) },
      insuredCtx
    )
  );
  expect(res.statusCode).toBe(403);
  expect(reschedule).not.toHaveBeenCalled();
});

test("PATCH .../reschedule -> 202 on success", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  reschedule.mockResolvedValue({ appointmentUuid: "u2", scheduleId: 42 });
  const res = await handler.rescheduleAppointment(
    withAuth(
      { pathParameters: { appointmentUuid: "u1" }, body: JSON.stringify({ newScheduleId: 42 }) },
      insuredCtx
    )
  );
  expect(res.statusCode).toBe(202);
  expect(reschedule).toHaveBeenCalledWith("u1", 42);
  expect(json(res).newAppointmentUuid).toBe("u2");
});

test("PATCH .../reschedule -> 409 when use case rejects a non-pending appointment", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  reschedule.mockRejectedValue(new ConflictError("Only a PENDING appointment can be rescheduled"));
  const res = await handler.rescheduleAppointment(
    withAuth(
      { pathParameters: { appointmentUuid: "u1" }, body: JSON.stringify({ newScheduleId: 42 }) },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(409);
});

test("PATCH .../reschedule -> 500 on unexpected error", async () => {
  getById.mockResolvedValue({ appointmentUuid: "u1", insuredId: "01234" });
  reschedule.mockRejectedValue(new Error("SNS unavailable"));
  const res = await handler.rescheduleAppointment(
    withAuth(
      { pathParameters: { appointmentUuid: "u1" }, body: JSON.stringify({ newScheduleId: 42 }) },
      agentCtx
    )
  );
  expect(res.statusCode).toBe(500);
});

// ─── getAppointmentHistory ────────────────────────────────────────────────────

test("GET .../history -> 400 if appointmentUuid missing", async () => {
  const res = await handler.getAppointmentHistory({ pathParameters: null } as never);
  expect(res.statusCode).toBe(400);
});

test("GET .../history -> 403 when no auth context", async () => {
  const res = await handler.getAppointmentHistory(
    withAuth({ pathParameters: { appointmentUuid: "u1" } })
  );
  expect(res.statusCode).toBe(403);
});

test("GET .../history -> 200 with events for an agent", async () => {
  getHistory.mockResolvedValue([{ eventType: "APPOINTMENT_CREATED", insuredId: "01234" }]);
  const res = await handler.getAppointmentHistory(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, agentCtx)
  );
  expect(res.statusCode).toBe(200);
  expect(json(res)).toEqual([{ eventType: "APPOINTMENT_CREATED", insuredId: "01234" }]);
});

test("GET .../history -> 403 when insured requests someone else's history", async () => {
  getHistory.mockResolvedValue([{ eventType: "APPOINTMENT_CREATED", insuredId: "99999" }]);
  const res = await handler.getAppointmentHistory(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(403);
});

test("GET .../history -> 200 empty list is not blocked by the ownership check", async () => {
  getHistory.mockResolvedValue([]);
  const res = await handler.getAppointmentHistory(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(200);
});

test("GET .../history -> 500 on unexpected error", async () => {
  getHistory.mockRejectedValue(new Error("DynamoDB unavailable"));
  const res = await handler.getAppointmentHistory(
    withAuth({ pathParameters: { appointmentUuid: "u1" } }, agentCtx)
  );
  expect(res.statusCode).toBe(500);
});

// ─── confirmAppointment ──────────────────────────────────────────────────────

test("SQS record -> calls service with appointmentUuid", async () => {
  complete.mockResolvedValue(undefined);
  await handler.confirmAppointment({
    Records: [{ body: JSON.stringify({ detail: { appointmentUuid: "u1" } }) }],
  } as never);
  expect(complete).toHaveBeenCalledWith("u1");
});

test("SQS record -> skips malformed JSON without calling complete", async () => {
  await handler.confirmAppointment({
    Records: [{ body: "not-valid-json", messageId: "msg-1" }],
  } as never);
  expect(complete).not.toHaveBeenCalled();
});

test("SQS record -> skips record missing appointmentUuid without calling complete", async () => {
  await handler.confirmAppointment({
    Records: [{ body: JSON.stringify({ detail: {} }), messageId: "msg-2" }],
  } as never);
  expect(complete).not.toHaveBeenCalled();
});
