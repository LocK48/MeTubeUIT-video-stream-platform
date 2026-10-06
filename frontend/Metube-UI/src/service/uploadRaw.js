import axios from "axios";
import { encrypting } from "../../../../api_server/src/middleware/AES.js";
import { apiBase } from "./apiBase.js";

const secret_key = import.meta.env.VITE_AES_SECRET_KEY;
const host = apiBase;

export const uploadS3 = async (file, progress) => {
  if (!file) throw new Error("Empty file");

  try {
    const { name, type, size } = file;

    // 1> presigned URL
    const vietnixRep = await axios.post(
      `${host}/presigned-URL`,
      {
        fileName: name,
        contentType: type,
        fileSize: size,
      },
      {
        withCredentials: true,
      },
    );

    const { url, key } = vietnixRep.data;
    const encryptKey = encrypting(secret_key, key);

    // 2> init DB
    await axios.post(
      `${host}/${encryptKey}/initVidDB`,
      {
        videoPath: key,
        videoSize: size,
        mimeType: type,
      },
      {
        withCredentials: true,
      },
    );

    // 3> upload S3 (không cần auth)
    await axios.put(url, file, {
      headers: { "Content-Type": type },
      onUploadProgress: (e) => {
        const percent = e.total ? Math.round((e.loaded * 100) / e.total) : 0;
        if (progress) progress(percent);
      },
    });

    return encryptKey;
  } 
  catch (err) {
    console.error("Error when uploading video to S3: ", err);
    throw err;
  }
};
