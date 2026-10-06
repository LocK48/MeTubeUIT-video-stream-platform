import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler"; 
import https from "https";

const storage_endpoint = process.env.ENDPOINT;
const storage_access_key_id = process.env.ACCESS_KEY_ID;
const storage_secret_key = process.env.SECRET_KEY;

export const s3Client = new S3Client({
  region: "auto",
  endpoint: storage_endpoint,
  credentials: {
    accessKeyId: storage_access_key_id,
    secretAccessKey: storage_secret_key,
  },
  forcePathStyle: false,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  requestHandler: new NodeHttpHandler({ 
    httpsAgent: new https.Agent(
      { maxSockets: 200 }
    ) 
  })
});
