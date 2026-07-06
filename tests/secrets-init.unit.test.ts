import { mockClient } from "aws-sdk-client-mock";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";

const sendCfnResponseMock = jest.fn();
jest.mock("../src/infra/cfn-response", () => ({
  sendCfnResponse: (...args: unknown[]) => sendCfnResponseMock(...args),
}));

import { handler } from "../src/infra/secrets-init";

const ssmMock = mockClient(SSMClient);

function makeEvent(
  requestType: "Create" | "Update" | "Delete",
  props: Record<string, string> = {}
): CloudFormationCustomResourceEvent {
  return {
    RequestType: requestType,
    ResponseURL: "https://example.com/cb",
    StackId: "stack-1",
    RequestId: "req-1",
    LogicalResourceId: "SecretsInit",
    ResourceType: "Custom::PasswordToSSM",
    ServiceToken: "arn:aws:lambda:us-east-1:111111111111:function:secrets-init",
    ResourceProperties: {
      ServiceToken: "arn:aws:lambda:us-east-1:111111111111:function:secrets-init",
      ...props,
    },
  } as unknown as CloudFormationCustomResourceEvent;
}

describe("secrets-init handler", () => {
  beforeEach(() => {
    ssmMock.reset();
    sendCfnResponseMock.mockReset();
    sendCfnResponseMock.mockResolvedValue(undefined);
  });

  test("Delete request -> sends SUCCESS with skipped=true and never touches SSM", async () => {
    await handler(makeEvent("Delete"));

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "secrets-init:/appointments/rds/password",
      { skipped: true }
    );
    expect(ssmMock.calls()).toHaveLength(0);
  });

  test("Create request, parameter already exists -> SUCCESS with exists=true, no write", async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: "existing-secret" } });

    await handler(makeEvent("Create", { PasswordParamName: "/custom/pw" }));

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "secrets-init:/custom/pw",
      { exists: true }
    );
    expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(0);
  });

  test("Create request, parameter missing -> generates and stores a new password", async () => {
    ssmMock.on(GetParameterCommand).rejects(new Error("ParameterNotFound"));
    ssmMock.on(PutParameterCommand).resolves({});

    await handler(makeEvent("Create", { SsmName: "/other/pw" }));

    expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(1);
    const putInput = ssmMock.commandCalls(PutParameterCommand)[0].args[0]
      .input;
    expect(putInput.Name).toBe("/other/pw");
    expect(putInput.Type).toBe("SecureString");
    expect(putInput.KeyId).toBe("alias/aws/ssm");
    expect(putInput.Overwrite).toBe(true);
    expect(typeof putInput.Value).toBe("string");
    expect((putInput.Value as string).length).toBeGreaterThan(0);

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "secrets-init:/other/pw",
      { created: true }
    );
  });

  test("falls back to the default parameter name when none is provided in ResourceProperties", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "x" } });

    await handler(makeEvent("Update"));

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "SUCCESS",
      "secrets-init:/appointments/rds/password",
      { exists: true }
    );
  });

  test("PutParameterCommand failure -> sends FAILED with the error message and rethrows", async () => {
    ssmMock.on(GetParameterCommand).rejects(new Error("not found"));
    ssmMock.on(PutParameterCommand).rejects(new Error("access denied"));

    await expect(handler(makeEvent("Create"))).rejects.toThrow(
      "access denied"
    );

    expect(sendCfnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      "FAILED",
      "secrets-init:/appointments/rds/password",
      { error: "access denied" }
    );
  });
});
