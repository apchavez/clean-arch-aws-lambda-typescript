const create = jest.fn();
const listByInsured = jest.fn();
const complete = jest.fn();
jest.mock("../src/index", () => ({
  __esModule: true,
  appointmentMakeService: () => ({
    create,
    listByInsured,
    complete,
  }),
}));
import * as handler from "../src/api/lambda/appointment";
const json = (r: any) => JSON.parse(r?.body ?? "{}");
beforeEach(() => {
  jest.clearAllMocks();
  create.mockReset();
  listByInsured.mockReset();
  complete.mockReset();
});
test("POST /appointments -> 400 if invalid body", async () => {
  const res = await handler.createAppointment({ body: "{}" } as any);
  expect(res.statusCode).toBe(400);
});
test("POST /appointments -> 201 (happy path)", async () => {
  create.mockResolvedValue({ appointmentUuid: "u1", status: "pending" });

  const res = await handler.createAppointment({
    body: JSON.stringify({
      insuredId: "01234",
      scheduleId: 100,
      countryISO: "PE",
    }),
  } as any);
  expect(create).toHaveBeenCalled();
  expect(res.statusCode).toBe(201);
  expect(json(res).status).toBe("pending");
});
test("GET /appointments/{insuredId} -> 200", async () => {
  listByInsured.mockResolvedValue([
    { appointmentUuid: "u1", status: "pending" },
  ]);
  const res = await handler.listByInsured({
    pathParameters: { insuredId: "01234" },
  } as any);

  expect(listByInsured).toHaveBeenCalledWith("01234");
  expect(res.statusCode).toBe(200);
});
test("SQS confirmación -> llama servicio con appointmentUuid", async () => {
  complete.mockResolvedValue(true);

  await handler.confirmAppointment({
    Records: [{ body: JSON.stringify({ detail: { appointmentUuid: "u1" } }) }],
  } as any);

  expect(complete).toHaveBeenCalledWith("u1");
});
