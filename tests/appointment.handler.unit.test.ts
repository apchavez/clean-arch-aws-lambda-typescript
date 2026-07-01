const create = jest.fn();
const listByInsured = jest.fn();
const complete = jest.fn();
jest.mock("../src/index", () => ({
  __esModule: true,
  appointmentMakeService: () => ({ create, listByInsured, complete }),
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
  create.mockReset();
  listByInsured.mockReset();
  complete.mockReset();
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
  expect(create).toHaveBeenCalledWith({ insuredId: "01234", scheduleId: 100, countryISO: "PE" });
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

test("GET /appointments/{insuredId} -> 200 when agent lists any insured", async () => {
  listByInsured.mockResolvedValue([{ appointmentUuid: "u1", status: "pending" }]);
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" } }, agentCtx)
  );
  expect(res.statusCode).toBe(200);
  expect(listByInsured).toHaveBeenCalledWith("01234");
});

test("GET /appointments/{insuredId} -> 200 when insured lists their own appointments", async () => {
  listByInsured.mockResolvedValue([]);
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" } }, insuredCtx)
  );
  expect(res.statusCode).toBe(200);
});

test("GET /appointments/{insuredId} -> 500 on unexpected service error", async () => {
  listByInsured.mockRejectedValue(new Error("DynamoDB unavailable"));
  const res = await handler.listByInsured(
    withAuth({ pathParameters: { insuredId: "01234" } }, agentCtx)
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
