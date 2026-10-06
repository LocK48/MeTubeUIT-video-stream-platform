import fs from "fs";
import path from "path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../config/storage.js";
import { contentTypeMap } from "../util/helper.js";

const fsPromises = fs.promises;

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return contentTypeMap[ext] || "application/octet-stream";
};

export const downloadObjectToFile = async(bucket, key, destinationPath) => {
    const cmd = new GetObjectCommand({
      Bucket: bucket, 
      Key: key,
    });
    const res = await s3Client.send(cmd);

    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    const body = res.Body;
    if(!body) throw new Error(`S3 object body empty for key ${key}`);

    await pipeline(body, fs.createWriteStream(destinationPath));
    return destinationPath;
};

export const uploadFileToBucket = async(bucket, key, filePath) => {
    const stat = await fsPromises.stat(filePath);
    const fileStream = fs.createReadStream(filePath);
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: getContentType(filePath),
      ContentLength: stat.size,
    });
    await s3Client.send(cmd);
    return key;
}

export const uploadDirectoryToBucket = async( bucket, prefix, sourceDirectory, rootDirectory = sourceDirectory ) => {
    const entries = await fsPromises.readdir(sourceDirectory, { withFileTypes: true });
    // Todo jobs
    const uploadTasks = [];

    for(const entry of entries) {
    const fullPath = path.join(sourceDirectory, entry.name);
    
    if (entry.isDirectory()) {
      // If directory
      uploadTasks.push(uploadDirectoryToBucket(bucket, prefix, fullPath, rootDirectory));
    } 
    else {
      // If file
      const relativePath = path.relative(rootDirectory, fullPath).split(path.sep).join("/");
      const objectKey = `${prefix.replace(/\/+$/g, "")}/${relativePath}`;
      
      uploadTasks.push(uploadFileToBucket(bucket, objectKey, fullPath));
    }
  }
    // Run all in parallel
    await Promise.all(uploadTasks);
};

