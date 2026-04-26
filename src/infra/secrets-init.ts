import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import crypto from "crypto";
import https from "https";

function send(event: any, Status: "SUCCESS" | "FAILED", Data: any) {
  const body = JSON.stringify({
    Status,
    Reason: "secrets-init",
    PhysicalResourceId: "secrets-init-v1",
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data,
  });
  const url = new URL(event.ResponseURL);

  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        method: "PUT",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        res.on("end", resolve);
        res.resume();
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export const handler = async (event: any) => {
  const name =
    event.ResourceProperties?.PasswordParamName || "/appointments/rds/password";
  const ssm = new SSMClient({});
  try {
    if (event.RequestType === "Delete") {
      await send(event, "SUCCESS", { skipped: true });
      return;
    }
    try {
      await ssm.send(
        new GetParameterCommand({ Name: name, WithDecryption: true })
      );
      await send(event, "SUCCESS", { exists: true });
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
      await send(event, "SUCCESS", { created: true });
    }
  } catch (err: any) {
    await send(event, "FAILED", { error: err?.message ?? String(err) });
    throw err;
  }
};
