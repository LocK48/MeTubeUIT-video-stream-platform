import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";

const storage_endpoint = process.env.ENDPOINT;
const storage_access_key_id = process.env.ACCESS_KEY_ID;
const storage_secret_key = process.env.SECRET_KEY;

const storage = new S3Client({
    region: "auto",
    endpoint: storage_endpoint,
    credentials: {
        accessKeyId: storage_access_key_id,
        secretAccessKey: storage_secret_key,
    },
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
})

export default storage;
