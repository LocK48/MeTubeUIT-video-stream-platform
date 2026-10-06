import axios from "axios";
import { apiBase } from "./apiBase.js";

const STORAGE_PREFIX = "MeTube";
const hostPath = `${apiBase}/videos`;

const getUserKey = (user, suffix) => {
  const id = user?.email || user?.id || user?.name || "guest";
  return `${STORAGE_PREFIX}_${id}_${suffix}`;
};

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const readJson = (key, fallback) => {
  return safeParse(localStorage.getItem(key), fallback);
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getWatchHistory = (user) => {
  if (!user) return [];
  return readJson(getUserKey(user, "watchHistory"), []);
};

export const addWatchHistory = async (user, video) => {
  if (!user || !video?.videoId) return;
  const key = getUserKey(user, "watchHistory");

  const existing = readJson(key, []);
  const next = [
    {
      videoId: video.videoId,
      title: video.title,
      channelName: video.userId?.name || video.channelName || video.uploader?.name || 'UITer',
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      createdAt: video.createdAt,
      viewedAt: new Date().toISOString(),
    },
    ...existing.filter((item) => item.videoId !== video.videoId),
  ].slice(0, 50);
  writeJson(key, next);
};

export const getSubscriptions = (user) => {
  if (!user) return [];
  return readJson(getUserKey(user, "subscriptions"), []);
};

export const isSubscribed = (user, channelName) => {
  if (!user || !channelName) return false;
  return getSubscriptions(user).some((item) => item.channelName === channelName);
};

export const toggleSubscription = (user, channel) => {
  if (!user || !channel?.channelName) return [];
  const key = getUserKey(user, "subscriptions");
  const existing = readJson(key, []);
  const already = existing.some((item) => item.channelName === channel.channelName);

  const next = already
    ? existing.filter((item) => item.channelName !== channel.channelName)
    : [{ channelName: channel.channelName, channelAvatar: channel.channelAvatar || null }, ...existing];

  writeJson(key, next);
  return next;
};

export const getUserUploads = (user) => {
  if (!user) return [];
  return readJson(getUserKey(user, "uploads"), []);
};

export const addUserUpload = (user, video) => {
  if (!user || !video?.videoId) return;
  const key = getUserKey(user, "uploads");
  const existing = readJson(key, []);
  const next = [
    {
      videoId: video.videoId,
      title: video.title,
      channelName: video.userId?.name || video.channelName || 'UITer',
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      createdAt: video.createdAt,
    },
    ...existing.filter((item) => item.videoId !== video.videoId),
  ].slice(0, 50);
  writeJson(key, next);
};

export const getWatchLater = (user) => {
  if (!user) return [];
  return readJson(getUserKey(user, "watchLater"), []);
};

export const addWatchLater = (user, video) => {
  if (!user || !video?.videoId) return;
  const key = getUserKey(user, "watchLater");
  const existing = readJson(key, []);
  const next = [
    {
      videoId: video.videoId,
      title: video.title,
      channelName: video.userId?.name || video.channelName || 'Unknown',
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      createdAt: video.createdAt,
    },
    ...existing.filter((item) => item.videoId !== video.videoId),
  ].slice(0, 100);
  writeJson(key, next);
};

export const removeWatchLater = (user, videoId) => {
  if (!user || !videoId) return;
  const key = getUserKey(user, "watchLater");
  const existing = readJson(key, []);
  const next = existing.filter((v) => v.videoId !== videoId);
  writeJson(key, next);
  return next;
};

export const getTheme = () => {
  return localStorage.getItem("MeTube_theme") || "dark";
};

export const setTheme = (theme) => {
  localStorage.setItem("MeTube_theme", theme);
};
