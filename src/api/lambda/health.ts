import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ok, serviceUnavailable } from "../../shared/http";

const client = new DynamoDBClient({});
const TableName = process.env.TABLE_APPOINTMENT_EVENTS!;

export const handler = async () => {
  const checks: Record<string, string> = { dynamoDb: "UP" };

  try {
    await client.send(new DescribeTableCommand({ TableName }));
  } catch {
    checks.dynamoDb = "DOWN";
  }

  const allUp = Object.values(checks).every((v) => v === "UP");
  const body = {
    status: allUp ? "UP" : "DOWN",
    checks,
    timestamp: new Date().toISOString(),
  };

  return allUp ? ok(body) : serviceUnavailable(body);
};
