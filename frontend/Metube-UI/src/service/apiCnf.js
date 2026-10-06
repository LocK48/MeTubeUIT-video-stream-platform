import axios from "axios";
import { apiBase } from "./apiBase.js";

const apiCnf = async (key) => {
  try {
    const apiRes = await axios.post(
      `${apiBase}/${key}/cnf`,
      {},
      {
        withCredentials: true,
      },
    );

    return apiRes.data.status;
  } catch (err) {
    console.error(`Upload status confirmation failed: ${err}`);
    throw err;
  }
};

export const uploadCnf = async (key) => {
  return await apiCnf(key);
};
