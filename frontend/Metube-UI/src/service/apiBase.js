const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.trim();
const isLocalVite =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  !["8000", "8001"].includes(window.location.port);

export const apiOrigin = (
  configuredApiOrigin ||
  (isLocalVite ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin)
).replace(/\/+$/, "");

export const apiBase = `${apiOrigin}/metube`;
