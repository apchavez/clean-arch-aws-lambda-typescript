import type { Appointment } from "../src/domain/entities/Appointment";

const ORIGINAL_ENV = { ...process.env };

const appointment: Appointment = {
  appointmentUuid: "u1",
  insuredId: "01234",
  scheduleId: 100,
  countryISO: "PE",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function setBaseEnv() {
  process.env.RDS_PE_HOST = "pe-host";
  process.env.RDS_CL_HOST = "cl-host";
  process.env.RDS_USER = "admin";
  process.env.RDS_PE_DATABASE = "pe_db";
  process.env.RDS_CL_DATABASE = "cl_db";
  delete process.env.RDS_PE_PORT;
  delete process.env.RDS_CL_PORT;
  delete process.env.RDS_PASSWORD;
  delete process.env.RDS_PASSWORD_SSM;
}

// The repo module keeps a module-scoped pool cache and password cache, so
// each test loads a fresh instance (with a fresh SSM mock bound to the same
// freshly-loaded @aws-sdk/client-ssm) to avoid state leaking across tests.
async function loadRepoModule(poolExecute = jest.fn().mockResolvedValue([{}])) {
  jest.doMock("mysql2/promise", () => ({
    createPool: jest.fn(() => ({ execute: poolExecute })),
  }));
  const { mockClient } = await import("aws-sdk-client-mock");
  const { SSMClient, GetParameterCommand } = await import(
    "@aws-sdk/client-ssm"
  );
  const ssmMock = mockClient(SSMClient);
  const mysql = await import("mysql2/promise");
  const repoModule = await import(
    "../src/infra/repos/MySQLCountryBookingRepo"
  );
  return { repoModule, mysql, poolExecute, ssmMock, GetParameterCommand };
}

describe("MySQLCountryBookingRepo", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    setBaseEnv();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("book -> uses RDS_PASSWORD env var directly, without calling SSM", async () => {
    process.env.RDS_PASSWORD = "env-password";
    const { repoModule, mysql, poolExecute, ssmMock } = await loadRepoModule();
    const repo = new repoModule.MySQLCountryBookingRepo();

    await repo.book(appointment);

    expect(ssmMock.calls()).toHaveLength(0);
    expect(mysql.createPool as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "pe-host",
        port: 3306,
        user: "admin",
        password: "env-password",
        database: "pe_db",
      })
    );
    expect(poolExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO appointments"),
      [
        appointment.appointmentUuid,
        appointment.insuredId,
        appointment.scheduleId,
        appointment.countryISO,
        appointment.status,
        appointment.createdAt,
        appointment.updatedAt,
      ]
    );
  });

  test("book -> fetches the password from SSM and caches it across bookings to different countries", async () => {
    process.env.RDS_PASSWORD_SSM = "/rds/password";
    const { repoModule, mysql, ssmMock, GetParameterCommand } =
      await loadRepoModule();
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: "ssm-password" } });
    const repo = new repoModule.MySQLCountryBookingRepo();

    await repo.book(appointment);
    await repo.book({ ...appointment, countryISO: "CL" });

    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
    expect(mysql.createPool as jest.Mock).toHaveBeenCalledTimes(2);
  });

  test("book -> reuses the same pool for repeated bookings to the same country", async () => {
    process.env.RDS_PASSWORD = "env-password";
    const { repoModule, mysql } = await loadRepoModule();
    const repo = new repoModule.MySQLCountryBookingRepo();

    await repo.book(appointment);
    await repo.book(appointment);

    expect(mysql.createPool as jest.Mock).toHaveBeenCalledTimes(1);
  });

  test("book -> honors RDS_CL_PORT override instead of the 3306 default", async () => {
    process.env.RDS_PASSWORD = "env-password";
    process.env.RDS_CL_PORT = "3307";
    const { repoModule, mysql } = await loadRepoModule();
    const repo = new repoModule.MySQLCountryBookingRepo();

    await repo.book({ ...appointment, countryISO: "CL" });

    expect(mysql.createPool as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "cl-host", port: 3307, database: "cl_db" })
    );
  });

  test("book -> throws when neither RDS_PASSWORD nor RDS_PASSWORD_SSM is configured", async () => {
    const { repoModule } = await loadRepoModule();
    const repo = new repoModule.MySQLCountryBookingRepo();

    await expect(repo.book(appointment)).rejects.toThrow(
      "RDS_PASSWORD_SSM is not defined"
    );
  });

  test("book -> throws when the SSM parameter value is empty", async () => {
    process.env.RDS_PASSWORD_SSM = "/rds/password";
    const { repoModule, ssmMock, GetParameterCommand } = await loadRepoModule();
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "" } });
    const repo = new repoModule.MySQLCountryBookingRepo();

    await expect(repo.book(appointment)).rejects.toThrow(
      "Could not read SSM password or it is empty"
    );
  });
});
