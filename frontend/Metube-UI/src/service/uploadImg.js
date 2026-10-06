import axios from "axios";
import { apiBase } from "./apiBase.js";

const secret_key = import.meta.env.VITE_AES_SECRET_KEY;
const host = apiBase;

export const uploadImgS3 = async (file, Mykey) => {
  if (!file) throw new Error("Empty file");
  try {
    const { name, type, size } = file;

    // 1> Request for presigned URL
    const s3Rep = await axios.post(
      `${host}/upFile/presigned-URL`,
      {
        fileName: name,
        folderName: Mykey,
        contentType: type,
        fileSize: size,
      },
      {
        withCredentials: true,
      },
    );

    const { url, key } = s3Rep.data;
    // Upload directly with the presigned PUT URL.
    await axios.put(url, file, { headers: { "Content-Type": type } });
    // Return key(videoId) for next step
    return key;
  } 
  catch (err) {
    console.error("Error uploading image to S3: ", err);
    throw err;
  }
};
