import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE;

let docClient: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient | null {
  if (!TABLE_NAME) return null;
  if (docClient) return docClient;

  const raw = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

  docClient = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });

  return docClient;
}

export function getTableName(): string | undefined {
  return TABLE_NAME;
}

export function getDynamo(): DynamoDBDocumentClient | null {
  return getClient();
}
