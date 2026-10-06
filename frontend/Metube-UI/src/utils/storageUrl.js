// Set VITE_PROCESSED_STORAGE_URL to the public domain for metub-r2 followed by
// /processed-video. The fallback keeps existing Vietnix deployments working.
export const processedStorageBase =
  import.meta.env.VITE_PROCESSED_STORAGE_URL ||
  "https://s3.vn-hcm-1.vietnix.cloud/processed-video";
