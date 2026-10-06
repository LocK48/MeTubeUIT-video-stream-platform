import path from "path";
import "dotenv/config";

import { createWorker } from "../config/queue.js";
import { downloadObjectToFile, uploadDirectoryToBucket } from "./storage.js";
import { VideoDB_operation } from "./db.js";
import { uploadDirToBucket } from "./uploadNew.js";

import { VIDEO_STATUS } from "../../../api_server/src/util/constants.js";

import { getVideoDuration } from "../util/getDuration.js";
import { setUpWrkEnv } from "../util/workspace.js";
import { HLS } from "../processor/HLS.js";
import { generateThumbnail } from "../processor/thumbnailGen.js";

import { onJobComplete } from "./sendSign.js";

import { cleanUpTmp } from "../processor/cleanUp.js"
import { decrypting } from "../../../api_server/src/middleware/AES.js";
import { formatOut, getNowTime } from "../util/helper.js";

const rawBucket = process.env.BUCKET_RAW_VIDEO;
const processedBucket = process.env.BUCKET_PROCESSED_VIDEO;
const aes_secret_key = process.env.AES_SECRET_KEY;

const { updateStatus, updateByVideoId } = VideoDB_operation;

// IMPLEMENT JWT
const role = "admin";

const processVideoJob = async (job) => {
  // Take job from BullMQ
  const { videoId, videoPath, timestamp, file } = job.data;
  if (!videoId || !videoPath) throw new Error("Job payload must include videoId and videoPath");

  // Set up working space
  const wrkEnv = await setUpWrkEnv({ videoId, videoPath });
  const { tempDir, rawFile, hlsChunksDir, manifestDir, thumbnailDir} = wrkEnv;

  let resolutions;

  try {
      console.log("[1]---- START DOWNLOAD FROM VIETNIX ----"); 

      // 1> Download raw video from vietnix
      await downloadObjectToFile(rawBucket, videoPath, rawFile);

      const duration = await getVideoDuration(rawFile);

      console.log("[+]---- FINISH ----");
      console.log("[2]---- START HLS & GEN THUMBNAIL ----");

      // 2> Transcode & generate thumbnail running in parallel
      const [hlsResult, thumbnail] = await Promise.all([
          HLS(rawFile, { manifestDir }),
          timestamp? generateThumbnail(rawFile, thumbnailDir, timestamp) : 
          !file?     generateThumbnail(rawFile, thumbnailDir, 1) : Promise.resolve(""),
      ]);

      console.log("[+]---- FINISH ----")

      resolutions = hlsResult;

      // Format name to display
      const decryptedVidId = decrypting(aes_secret_key, videoId);
      const fVidId = decryptedVidId.substring("videos/".length);
      
      // 3> Declare prefix in vietnix
      const manifestPrefix = `${role}/${fVidId}/manifest`;
      const playlistKey = `${manifestPrefix}/master.m3u8`;
      const thumbPrefix = `${role}/${fVidId}`;

      console.log("[3]---- START UPLOADING VIDEO TO VIETNIX ----");

      // 4> Upload processed video to vietnix
      await Promise.all([
          uploadDirToBucket(processedBucket, `processed-video/${manifestPrefix}`, manifestDir),
          uploadDirToBucket(processedBucket, `processed-video/${thumbPrefix}`, thumbnailDir)
      ]);

      console.log("[+]---- FINISH ----");
      console.log("[4]---- START UPDATING DATABASE ----");

      // 5> Update DB with metadata
      await updateByVideoId(videoId, { 
          status: VIDEO_STATUS.READY, 
          hlsPath: playlistKey, 
          thumbnailUrl: `${thumbPrefix}`,
          resolution: resolutions,
          duration: duration,
          createdAt: getNowTime(),
      });

      console.log("[5]---- START SENDING SIGNAL----");
      await onJobComplete(videoId);
      console.log("[+]---- FINISH ----");
      console.log("[!]---- DONE ===> SUCCESS ===> EXIT ----");
      console.log("--------------------------------------------------------------");

      return { 
            status: VIDEO_STATUS.READY, 
            hlsPath: playlistKey,
        };
    } 
    catch (err) {
        console.error("========== ERROR LOG ==========");
        console.error("ERROR:", err);
        console.error("STACK:", err.stack);
        if(err?.cause) console.error("CAUSE:", err.cause);
        if(err?.errors) console.error("AGGREGATE ERRORS:", err.errors);

        console.error(`[???] Worker processing failed for videoId=${formatOut(videoId)}`);
        console.error("--------------------------------------------------------------");

        await updateStatus(videoId, VIDEO_STATUS.FAIL);
        throw err;
    }
  finally {
      // Clean up after finishing job
      await cleanUpTmp(tempDir);
    }
};

export const worker = createWorker(processVideoJob);
