import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import crypto from "crypto";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";
import { sendCfnResponse } from "./cfn-response";

const PHYSICAL_ID = "secrets-init-v1";

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<void> => {
  const props = event.ResourceProperties as Record<string, string>;
  const name = props?.PasswordParamName ?? "/appointments/rds/password";
  const ssm = new SSMClient({});
  try {
    if (event.RequestType === "Delete") {
      await sendCfnResponse(event, "SUCCESS", PHYSICAL_ID, { skipped: true });
      return;
    }
    try {
      await ssm.send(
        new GetParameterCommand({ Name: name, WithDecryption: true })
      );
      await sendCfnResponse(event, "SUCCESS", PHYSICAL_ID, { exists: true });
    } catch {
      const pwd = crypto.randomBytes(24).toString("base64url");
      await ssm.send(
        new PutParameterCommand({
          Name: name,
          Type: "SecureString",
          KeyId: "alias/aws/ssm",
          Value: pwd,
          Overwrite: true,
        })
      );
      await sendCfnResponse(event, "SUCCESS", PHYSICAL_ID, { created: true });
    }
  } catch (err: unknown) {
    await sendCfnResponse(event, "FAILED", PHYSICAL_ID, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};
