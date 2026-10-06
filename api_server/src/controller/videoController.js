import "dotenv/config";
import { VIDEO_STATUS } from "../util/constants.js";
import { getPresignedURL } from "../util/presignedURL.js";
import { checkHeadRequestS3 } from "../middleware/validate.js";
import { VideoDB_operation } from "../../../worker_server/src/service/db.js";
import { vnTimeString } from "../util/helper.js";
import { standardInputDB } from "../model/videoModel.js";
import { decrypting } from "../middleware/AES.js";
import { addJobToQueue } from "../service/queue.js";

const raw_video_bucket = process.env.BUCKET_RAW_VIDEO;
const processed_video_bucket = process.env.BUCKET_PROCESSED_VIDEO;
const secret_key = process.env.AES_SECRET_KEY;

const { updateStatus, updateByVideoId, findByVideoId, create, findAll, incViewAndFind, findUploaderByVideoId } =
  VideoDB_operation;

export const generatePresignedURL = async (req, res) => {
  try {
    const { fileName, contentType, fileSize } = req.body;
    const { url, videoId } = await getPresignedURL({
      fileName: fileName,
      bucket: raw_video_bucket,
      contentType: contentType,
      fileSize: fileSize,
    });

    return res.status(200).json({
      url: url,
      key: videoId,
    });
  } catch (err) {
    console.log(`Something wrong with presigned URL service: ${err.message}`);
    res.status(500).json({
      message: " Failed to generate presigned URL for object upload",
      error: err.message,
    });
  }
};

export const confirmUpload = async (req, res) => {
  try {
    // Extract videoId from client request
    const { videoId } = req.params;
    const decryptVideoId = decrypting(secret_key, videoId);

    // Check if video file is available in Vietnix
    const fileIsExist = await checkHeadRequestS3(
      raw_video_bucket,
      decryptVideoId,
    );
    if (!fileIsExist)
      return res.status(400).json({
        message: "Video is not existed",
      });
    return res.status(200).json({
      message: "Valid video, upload confirmation successfully",
      data: {
        status: VIDEO_STATUS.PROCESSING,
      },
      time: vnTimeString(),
    });
  } catch (err) {
    console.log(`Upload confirmation failed: ${err.message}`);
    return res.status(500).json({
      message: "Upload confirmation failed.Try again",
      error: err.message,
    });
  }
};

export const checkStatusUpload = async (req, res) => {
  try {
    const { videoId } = req.params;
    const uploadVideo = await findByVideoId(videoId);
    return res.status(200).json({
      message: "Accessed information from Database successfully",
      data: {
        uploadStatus: uploadVideo.status,
      },
      time: vnTimeString(),
    });
  } catch (err) {
    console.log(`Can not get information from Database: ${err}`);
    return res.status(500).json({
      message: "Get information failed.Try again",
      error: err.message,
    });
  }
};

export const updateSubmitDB = async (req, res) => {
  try {
    const { videoId } = req.params;
    const data = req.body;

    await updateByVideoId(videoId, data);

    return res.status(200).json({
      message: "Updated processing status for video successfully",
      time: vnTimeString(),
    });
  } catch (err) {
    console.log(`Can not update processing status for video: ${err}`);
    return res.status(500).json({
      message: "Update processing status failed.Try again",
      error: err.message,
    });
  }
};

export const initStatusDB = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { videoPath, videoSize, mimeType } = req.body;

    // Hash videoId from vietnix by default
    await create(
      standardInputDB({
        videoId: videoId,
        videoPath: videoPath,
        videoSize: videoSize,
        mimeType: mimeType,
        userId: req.user.id,
      }),
    );
    return res.status(200).json({
      message: "Initialized DB successfully",
      time: vnTimeString(),
    });
  } catch (err) {
    console.log(`Can not initialize DB for video: ${err}`);
    return res.status(500).json({
      message: "Initialized DB failed.Try again",
      error: err.message,
    });
  }
};

export const uploadThumbS3 = async (req, res) => {
  try {
    const { fileName, contentType, fileSize, folderName } = req.body;
    const { url, videoId } = await getPresignedURL({
      fileName: fileName,
      folderName: folderName,
      bucket: processed_video_bucket,
      contentType: contentType,
      fileSize: fileSize,
      nameDir: "thumbnail.jpg",
    });

    return res.status(200).json({
      url: url,
      key: videoId,
    });
  } catch (err) {
    console.log(`Can not upload user file to S3: ${err.message}`);
    res.status(500).json({
      message: " Failed to upload user file to vietnix",
      error: err.message,
    });
  }
};

export const callWorker = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { timestamp, file } = req.body;
    // Look up video in DB
    const video = await findByVideoId(videoId);
    // Enqueue job for worker to handle
    await addJobToQueue({
      videoId,
      videoPath: video.videoPath,
      timestamp: timestamp,
      file: file,
    });
    return res.status(200).json({
      message: "Pushed job successfully",
      time: vnTimeString(),
    });
  } catch (err) {
    console.log(`Can not connect to worker service: ${err}`);
    return res.status(500).json({
      message: "Call worker service failed.Try again",
      error: err.message,
    });
  }
};

export const getAllVideos = async (req, res) => {
  try {
    // Aggregate videos with uploader info from userCollections so frontend can show name/avatar
    const db = await (await import('../config/db.js')).client.db('Metube');
    const videosColl = db.collection('videoCollection');

    const agg = await videosColl
      .aggregate([
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "userCollections",
            localField: "userId",
            foreignField: "_id",
            as: "uploaderInfo",
          },
        },
        { $unwind: { path: "$uploaderInfo", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            userId: {
              _id: "$uploaderInfo._id",
              name: "$uploaderInfo.name",
              email: "$uploaderInfo.email",
              avatar: "$uploaderInfo.avatar",
              avatarUrl: "$uploaderInfo.avatarUrl",
            },
          },
        },
        {
          $project: {
            uploaderInfo: 0,
            passwordHash: 0,
          },
        },
      ])
      .toArray();

    res.status(200).json(agg);
  } catch (err) {
    console.error("Error in getting videos:", err);

    res.status(500).json({
      message: "Can not get videos list",
    });
  }
};

export const getVideoById = async (req, res) => {
  try {
    const { videoId } = req.params;

    // Aggregate single video with uploader info and increment view count
    const db = await (await import('../config/db.js')).client.db('Metube');
    const videosColl = db.collection('videoCollection');

    const agg = await videosColl
      .aggregate([
        { $match: { videoId } },
        {
          $lookup: {
            from: "userCollections",
            localField: "userId",
            foreignField: "_id",
            as: "uploaderInfo",
          },
        },
        { $unwind: { path: "$uploaderInfo", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            userId: {
              _id: "$uploaderInfo._id",
              name: "$uploaderInfo.name",
              email: "$uploaderInfo.email",
              avatar: "$uploaderInfo.avatar",
              avatarUrl: "$uploaderInfo.avatarUrl",
            },
          },
        },
        {
          $project: {
            uploaderInfo: 0,
            passwordHash: 0,
          },
        },
      ])
      .toArray();

    if (!agg || agg.length === 0) {
      return res.status(404).json({ message: "Can not find video" });
    }

    const video = agg[0];

    // increment views (keep existing atomic update behavior)
    await videosColl.updateOne({ videoId }, { $inc: { views: 1 }, $currentDate: { updatedAt: true } });

    res.status(200).json(video);
  } catch (err) {
    console.error("Error in getting selected video:", err);
    res.status(500).json({
      message: "Can not get video",
    });
  }
};

export const getMyVideos = async (req, res) => {
  try {
    const userId = req.user.id;

    const videos = await findAll();

    const myVideos = videos.filter(
      (video) => video.userId?.toString() === userId,
    );

    res.status(200).json(myVideos);
  } catch (err) {
    console.error("Error getting user videos:", err);

    res.status(500).json({
      message: "Can not get user videos",
    });
  }
};

export const deleteVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await findByVideoId(videoId);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    await VideoDB_operation.deleteByVideoId(videoId);

    return res.status(200).json({
      message: "Deleted successfully",
    });
  } 
  catch (err) {
    console.error("Delete video error:", err);
    return res.status(500).json({
      message: "Delete failed",
    });
  }
};

export const updateVideoInfo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description } = req.body;

    const video = await findByVideoId(videoId);
    if (!video) {
      return res.status(404).json({
        message: "Can not find video",
      });
    }

    // Only video owner can modify video
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    await updateByVideoId(videoId, { title, description });

    return res.status(200).json({
      message: "Updated video successfully",
    });
  } 
  catch (err) {
    console.error("Update video failed:", err);

    return res.status(500).json({
      message: "Update failed",
    });
  }
};

export const returnUploader = async (req, res) => {
  try{
    const { videoId } = req.params;
    const videoWithUploader = await findUploaderByVideoId(videoId);
    if (!videoWithUploader) {
      return res.status(404).json({
        message: "Can not find video to look up uploader",
      });
    }
    if (!videoWithUploader.uploader) {
      return res.status(404).json({
        message: "Uploader profile for this video does not exist or has been removed",
      });
    }
    return res.status(200).json({
      message: "Accessed uploader information from Database successfully",
      data: videoWithUploader.uploader,
      time: vnTimeString(),
    });
  }
  catch(err){
    console.log(`Can not get uploader information from Database: ${err.message}`);
    return res.status(500).json({
      message: "Get uploader information failed. Try again",
      error: err.message,
    });
  }
}
