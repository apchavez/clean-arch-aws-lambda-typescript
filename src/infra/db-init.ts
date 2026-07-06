import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import mysql from "mysql2/promise";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";
import { sendCfnResponse } from "./cfn-response";
import { logger } from "../shared/logger";

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

interface DbInitProps {
  PeHost: string;
  ClHost: string;
  PeDb: string;
  ClDb: string;
  User: string;
  PasswordSsm: string;
}

async function connectWithRetry(
  host: string,
  user: string,
  password: string,
  db: string,
  attempts = 30,
  delayMs = 10000
): Promise<mysql.Connection> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await mysql.createConnection({
        host,
        user,
        password,
        database: db,
        port: 3306,
        ssl: { rejectUnauthorized: true },
      });
    } catch (err: unknown) {
      lastErr = err;
      logger.warn("RDS connection attempt failed", {
        host,
        attempt: i,
        total: attempts,
        error: err instanceof Error ? err.message : String(err),
      });
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
): Promise<void> {
  const conn = await connectWithRetry(host, user, password, db);
  await conn.execute(CREATE_SQL);
  await conn.end();
}

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<void> => {
  const physicalId = `${event.LogicalResourceId}-v1`;
  try {
    if (event.RequestType === "Delete") {
      await sendCfnResponse(event, "SUCCESS", physicalId, { skipped: true });
      return;
    }
    const props = event.ResourceProperties as unknown as DbInitProps;
    const ssm = new SSMClient({});
    const param = await ssm.send(
      new GetParameterCommand({
        Name: props.PasswordSsm,
        WithDecryption: true,
      })
    );
    const password = param.Parameter?.Value;
    if (!password) throw new Error("RDS password not found in SSM");

    await initDb(props.PeHost, props.PeDb, props.User, password);
    await initDb(props.ClHost, props.ClDb, props.User, password);

    await sendCfnResponse(event, "SUCCESS", physicalId, { ok: true });
  } catch (err: unknown) {
    logger.error("DbInit failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await sendCfnResponse(event, "FAILED", physicalId, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};
