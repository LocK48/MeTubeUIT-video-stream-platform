import storage from "../config/storage.js";
import "dotenv/config";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { vnTimeString } from "./helper.js";

import { validMimeType, validFileExtension, validFileSize } from "../middleware/validate.js";
import { validImgExtension, validImgMimeType, validImgSize } from "../middleware/validate.js";
import { decrypting } from "../middleware/AES.js";

const aes_secret = process.env.AES_SECRET_KEY;
const role = "admin";

// Return temporary presigned URL & key 
export const getPresignedURL = async({
    fileName,
    folderName = "", 
    bucket, 
    contentType, 
    fileSize,
    expiresIn = 60 * 10, // Set TTL = 10 minutes
    nameDir = "videos"
}) => {

    const isThumbnail = nameDir !== "videos";
    if ((!isThumbnail && !validMimeType(contentType)) || (isThumbnail && !validImgMimeType(contentType))) throw new Error("Unsupported MIME type");
    if ((!isThumbnail && !validFileExtension(fileName)) || (isThumbnail && !validImgExtension(fileName))) throw new Error("Invalid or unsupported file extension");
    if ((!isThumbnail && !validFileSize(fileSize)) || (isThumbnail && !validImgSize(fileSize))) throw new Error("File exceeded allowed file size restriction");

    const tmp = `${vnTimeString()}_${fileName}`;
    const key = `raw-video/${nameDir}/${tmp}`;
    const Tkey = `processed-video/${role}/${decrypting(aes_secret, folderName).substring("videos/".length)}/thumbnail.jpg`;
    const objectKey = isThumbnail ? Tkey : key;
    const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType });
    const url = await getSignedUrl(storage, command, { expiresIn });

    return {
        url: url,
        videoId: isThumbnail ? Tkey.slice(0, -"/thumbnail.jpg".length) : key,
    }
}
