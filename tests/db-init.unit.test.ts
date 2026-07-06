import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";

const sendCfnResponseMock = jest.fn();
jest.mock("../src/infra/cfn-response", () => ({
  sendCfnResponse: (...args: unknown[]) => sendCfnResponseMock(...args),
}));

jest.mock("mysql2/promise", () => ({
  createConnection: jest.fn(),
}));

import mysql from "mysql2/promise";
import { handler } from "../src/infra/db-init";

const ssmMock = mockClient(SSMClient);
const createConnectionMock = mysql.createConnection as unknown as jest.Mock;

function makeEvent(
  requestType: "Create" | "Delete",
  props: Record<string, unknown> = {}
): CloudFormationCustomResourceEvent {
  return {
    RequestType: requestType,
    ResponseURL: "https://example.com/cb",
    StackId: "stack-1",
    RequestId: "req-1",
    LogicalResourceId: "DbInit",
    ResourceType: "Custom::DbInit",
    ServiceToken: "arn:aws:lambda:us-east-1:111111111111:function:db-init",
    ResourceProperties: {
      ServiceToken: "arn:aws:lambda:us-east-1:111111111111:function:db-init",
      PeHost: "pe-host",
      ClHost: "cl-host",
      PeDb: "pe_db",
      ClDb: "cl_db",
      User: "admin",
      PasswordSsm: "/rds/password",
      ...props,
    },
  } as unknown as CloudFormationCustomResourceEvent;
}

function makeConnStub() {
  return { execute: jest.fn().mockResolvedValue([{}]), end: jest.fn().mockResolvedValue(undefined) };
}

describe("db-init handler", () => {
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    ssmMock.reset();
    sendCfnResponseMock.mockReset();
    sendCfnResponseMock.mockResolvedValue(undefined);
    createConnectionMock.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    // Skip the real retry delay so exhausting retries doesn't slow the suite down.
    setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Delete request -> SUCCESS with skipped=true, no SSM or DB calls", async () => {
    await handler(makeEvent("Delete"));

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "DbInit-v1",
      { skipped: true }
    );
    expect(ssmMock.calls()).toHaveLength(0);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  test("missing SSM password -> FAILED and rethrows without attempting DB connections", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: {} });

    await expect(handler(makeEvent("Create"))).rejects.toThrow(
      "RDS password not found in SSM"
    );

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "FAILED",
      "DbInit-v1",
      { error: "RDS password not found in SSM" }
    );
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  test("success path -> initializes PE and CL databases and reports SUCCESS", async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: "s3cret" } });
    const peConn = makeConnStub();
    const clConn = makeConnStub();
    createConnectionMock
      .mockResolvedValueOnce(peConn)
      .mockResolvedValueOnce(clConn);

    await handler(makeEvent("Create"));

    expect(createConnectionMock).toHaveBeenCalledTimes(2);
    expect(createConnectionMock.mock.calls[0][0]).toMatchObject({
      host: "pe-host",
      database: "pe_db",
      user: "admin",
      password: "s3cret",
    });
    expect(createConnectionMock.mock.calls[1][0]).toMatchObject({
      host: "cl-host",
      database: "cl_db",
    });
    expect(peConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS appointments")
    );
    expect(peConn.end).toHaveBeenCalledTimes(1);
    expect(clConn.execute).toHaveBeenCalledTimes(1);
    expect(clConn.end).toHaveBeenCalledTimes(1);

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "DbInit-v1",
      { ok: true }
    );
  });

  test("retries the PE connection after a transient failure before succeeding", async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: "s3cret" } });
    const peConn = makeConnStub();
    createConnectionMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue(peConn);

    await handler(makeEvent("Create"));

    // First call failed, second call (retry) succeeded; CL then succeeds on its first try.
    expect(createConnectionMock).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "DbInit-v1",
      { ok: true }
    );
  });

  test("exhausts all retry attempts -> FAILED with the connection error and rethrows", async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: "s3cret" } });
    createConnectionMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(handler(makeEvent("Create"))).rejects.toThrow(
      "ECONNREFUSED"
    );

    // 30 attempts for the PE host before giving up; CL is never attempted.
    expect(createConnectionMock).toHaveBeenCalledTimes(30);
    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "FAILED",
      "DbInit-v1",
      { error: "ECONNREFUSED" }
    );
  }, 20000);
});
