import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const TABLE_NAME = "Appointments";
const REGION = "us-east-1";

const rawClient = new DynamoDBClient({
  endpoint: LOCALSTACK_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});
const ddb = DynamoDBDocumentClient.from(rawClient);

beforeAll(async () => {
  try {
    await rawClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
  }

  await rawClient.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "appointmentUuid", AttributeType: "S" },
        { AttributeName: "insuredId", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "appointmentUuid", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "byInsured",
          KeySchema: [{ AttributeName: "insuredId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    })
  );
});

afterAll(async () => {
  await rawClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
  rawClient.destroy();
});

const buildAppointment = (overrides: Record<string, unknown> = {}) => ({
  appointmentUuid: `test-uuid-${Date.now()}`,
  insuredId: "insured-001",
  scheduleId: 42,
  countryISO: "PE",
  status: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("DynamoDB Appointments table (LocalStack)", () => {
  it("saves an appointment and reads it back by insuredId", async () => {
    const item = buildAppointment({ insuredId: "insured-read-test" });

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "byInsured",
        KeyConditionExpression: "insuredId = :id",
        ExpressionAttributeValues: { ":id": "insured-read-test" },
      })
    );

    expect(result.Items).toHaveLength(1);
    expect(result.Items![0].appointmentUuid).toBe(item.appointmentUuid);
    expect(result.Items![0].status).toBe("pending");

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { appointmentUuid: item.appointmentUuid },
      })
    );
  });

  it("rejects a duplicate appointmentUuid via condition expression", async () => {
    const item = buildAppointment({ appointmentUuid: "fixed-uuid-duplicate" });

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(appointmentUuid)",
      })
    );

    await expect(
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { ...item, status: "completed" },
          ConditionExpression: "attribute_not_exists(appointmentUuid)",
        })
      )
    ).rejects.toThrow("ConditionalCheckFailedException");

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { appointmentUuid: "fixed-uuid-duplicate" },
      })
    );
  });

  it("returns empty array when querying a nonexistent insuredId", async () => {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "byInsured",
        KeyConditionExpression: "insuredId = :id",
        ExpressionAttributeValues: { ":id": "nonexistent-insured" },
      })
    );

    expect(result.Items).toHaveLength(0);
  });
});
