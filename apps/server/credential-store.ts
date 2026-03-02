import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.WEBAUTHN_TABLE_NAME || "pleno-live-webauthn-credentials";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-1" });
const ddb = DynamoDBDocumentClient.from(client);

export type StoredCredential = {
  credentialId: string;   // base64url
  publicKey: string;      // base64url COSE key
  counter: number;
  transports: string[];
  deviceId: string;
  platform: string;
  createdAt: number;
};

export async function storeCredential(cred: StoredCredential): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `DEVICE#${cred.deviceId}`,
      sk: `CREDENTIAL#${cred.credentialId}`,
      ...cred,
    },
  }));
}

export async function getCredentialsByDevice(deviceId: string): Promise<StoredCredential[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `DEVICE#${deviceId}`,
      ":skPrefix": "CREDENTIAL#",
    },
  }));

  return (result.Items || []) as StoredCredential[];
}

export async function getCredentialById(credentialId: string, deviceId: string): Promise<StoredCredential | null> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: `DEVICE#${deviceId}`,
      sk: `CREDENTIAL#${credentialId}`,
    },
  }));

  return result.Item ? (result.Item as StoredCredential) : null;
}

export async function updateCredentialCounter(credentialId: string, deviceId: string, newCounter: number): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: `DEVICE#${deviceId}`,
      sk: `CREDENTIAL#${credentialId}`,
    },
    UpdateExpression: "SET #counter = :counter",
    ExpressionAttributeNames: { "#counter": "counter" },
    ExpressionAttributeValues: { ":counter": newCounter },
  }));
}
