import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import mysql from "mysql2/promise";
import https from "https";
import { URL } from "url";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_uuid CHAR(36) NOT NULL UNIQUE,
  insured_id VARCHAR(64) NOT NULL,
  schedule_id INT NOT NULL,
  country_iso ENUM('PE','CL') NOT NULL,
  status ENUM('pending','completed') NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  KEY idx_insured (insured_id)
);`;

async function sendCfn(event: any, Status: "SUCCESS" | "FAILED", Data?: any) {
  const body = JSON.stringify({
    Status,
    Reason: Data?.error ?? "db-init",
    PhysicalResourceId: `${event.LogicalResourceId}-v1`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data,
  });
  const u = new URL(event.ResponseURL);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        method: "PUT",
        hostname: u.hostname,
        path: u.pathname + u.search,
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

async function connectWithRetry(
  host: string,
  user: string,
  password: string,
  db: string,
  attempts = 30,
  delayMs = 10000
) {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      const conn = await mysql.createConnection({
        host,
        user,
        password,
        database: db,
        port: 3306,
        ssl: { rejectUnauthorized: false },
      });
      return conn;
    } catch (err: any) {
      lastErr = err;
      console.log(
        `Attempt ${i}/${attempts} to connect to ${host} failed: ${err.message}`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function initDb(
  host: string,
  db: string,
  user: string,
  password: string
) {
  const conn = await connectWithRetry(host, user, password, db);
  await conn.execute(CREATE_SQL);
  await conn.end();
}

export const handler = async (event: any) => {
  try {
    if (event.RequestType === "Delete") {
      await sendCfn(event, "SUCCESS", { skipped: true });
      return;
    }
    const props = event.ResourceProperties;
    const ssm = new SSMClient({});
    const param = await ssm.send(
      new GetParameterCommand({
        Name: props.PasswordSsm,
        WithDecryption: true,
      })
    );
    const password = param.Parameter?.Value!;

    await initDb(props.PeHost, props.PeDb, props.User, password);
    await initDb(props.ClHost, props.ClDb, props.User, password);

    await sendCfn(event, "SUCCESS", { ok: true });
  } catch (err: any) {
    console.error("DbInit failed:", err);
    await sendCfn(event, "FAILED", { error: err.message });
    throw err;
  }
};
