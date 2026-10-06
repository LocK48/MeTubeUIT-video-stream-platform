import axios from "axios";
import { apiBase } from "./apiBase.js";

const axiosClient = axios.create({
  baseURL: apiBase,
  withCredentials: true, //
});

export default axiosClient;
