import https from "https";
import { URL } from "url";

interface CfnEvent {
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
}

export function sendCfnResponse(
  event: CfnEvent,
  status: "SUCCESS" | "FAILED",
  physicalResourceId: string,
  data: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify({
    Status: status,
    Reason: typeof data.error === "string" ? data.error : status.toLowerCase(),
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  });
  const url = new URL(event.ResponseURL);
  return new Promise((resolve, reject) => {
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
