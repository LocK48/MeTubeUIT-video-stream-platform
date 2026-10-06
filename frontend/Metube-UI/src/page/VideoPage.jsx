import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Toaster } from 'react-hot-toast';

import { ThumbsUp, ThumbsDown, Redo2, Bookmark, Ellipsis, } from "lucide-react";
import { SiGooglegemini } from "react-icons/si";

import VideoPlayer from "../components/VideoPlayer";
import VideoCard from "../components/VideoCard";
import { useAuth } from "../context/AuthContext.jsx";
import { addWatchHistory, isSubscribed, toggleSubscription, addWatchLater } from "../service/userDataService.js";
import { formatOut } from "../../../../worker_server/src/util/helper.js";
import { displayTimeFromDB } from "../utils/cal_in4.js";
import { SubscribeBtn } from "../utils/renderSth.jsx";
import { getUploader } from "../utils/uploader.js";
import { notifyError, notifySuccess } from '../helper/popUp.js';
import { processedStorageBase } from '../utils/storageUrl.js';
import { apiBase } from '../service/apiBase.js';

const hostPath = `${apiBase}/videos`;
const prefix = processedStorageBase;

const VideoPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIcon, setActiveIcon] = useState(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [expandDesc, setExpandDesc] = useState(false);
  const [recommendedVideos, setRecommendedVideos] = useState([]);
  const [subscribed, setSubscribed] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const timerRef = useRef(null);

  const playerRef = useRef(null);

  const toggleTheater = () => {
    playerRef.current?.savePlaybackState?.();
    setIsTheaterMode((v) => !v);

    setTimeout(() => {
      playerRef.current?.restorePlaybackState?.();
    }, 0);
  };

  useEffect(() => {
    const loadVideo = async () => {
      try {
        const response = await fetch(`${hostPath}/${id}`);
        if (!response.ok) {
          throw new Error("Video is not existed");
        }
        const data = await response.json();
        setVideo(data);
      } 
      catch (error) {
        console.error(error);
        setError("Failed to load video");
      } 
      finally {
        setLoading(false);
      }
    };

    const loadRecommended = async () => {
      try {
        const res = await fetch(hostPath);
        const data = await res.json();
        setRecommendedVideos(data);
      } 
      catch (err) {
        console.error(err);
      }
    };

    loadVideo();
    loadRecommended();
  }, [id]);

  useEffect(() => {
    if (video && user) {
      addWatchHistory(user, video);
      setSubscribed(isSubscribed(user, getUploader(video).name || ""));
    }
  }, [user, video]);

  const getNextVideoId = () => {
    if (!recommendedVideos || recommendedVideos.length === 0) return null;
    const idx = recommendedVideos.findIndex((v) => v.videoId === video?.videoId || v.videoId === id);
    if (idx === -1) return recommendedVideos[0].videoId;
    if (idx + 1 < recommendedVideos.length) return recommendedVideos[idx + 1].videoId;
    return recommendedVideos[0].videoId;
  };

  const getNextVideo = () => {
    if (!recommendedVideos || recommendedVideos.length === 0) return null;
    const idx = recommendedVideos.findIndex((v) => v.videoId === video?.videoId || v.videoId === id);
    if (idx === -1) return recommendedVideos[0];
    if (idx + 1 < recommendedVideos.length) return recommendedVideos[idx + 1];
    return recommendedVideos[0];
  };

  const handleVideoEnded = () => {
    if (!isAutoPlay) return;
    setCountdown(15);
  };

  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      (async () => {
        let nextId = getNextVideoId();
        if (!nextId) {
          try {
            const res = await fetch(hostPath);
            const list = await res.json();
            setRecommendedVideos(list);
            if (list && list.length > 0) nextId = list[0].videoId;
          } 
          catch (err) {
            console.error('Failed to fetch recommended videos for autoplay', err);
          }
        }
        if (nextId) window.location.href = `/video/${nextId}`;
      })();
      return;
    }

    timerRef.current = setTimeout(() => {
      setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown]);

  const _nextItem = getNextVideo();
  const nextPreview = _nextItem
    ? { title: _nextItem.title, poster: `${prefix}/${_nextItem.thumbnailUrl}/thumbnail.jpg`, videoId: _nextItem.videoId }
    : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        Loading...
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex justify-center items-center h-64 text-lg text-red-500">
        {error || "Video not found"}
      </div>
    );
  }

  const iconProp = [
    { keyId: "like", ico: ThumbsUp },
    { keyId: "dislike", ico: ThumbsDown },
  ];

  const VideoDetails = () => (
    <>
      <Toaster position="top-right" reverseOrder={false}/>
      <h1 className="mt-0 text-xl leading-none tracking-none font-bold mb-0">{video.title}</h1>
      <div className="flex items-center justify-start gap-3 mb-0 flex-wrap leading-tight">
        <img
          src={getUploader(video).avatarUrl || "https://tinyurl.com/277pc7ru"}
          alt={getUploader(video).name  || "K13T DU0N9"}
          className="w-10 h-10 rounded-full"
        />
        <div>
          <p className="mt-2 font-semibold mb-0">
            {getUploader(video).name || "K13T DU0N9"}
          </p>
          <p className="text-sm font-md text-gray-500 tracking-tight">{video.subscriber || "8.3 N"} subscriber {video.subscriber > 1? "s" : ""}</p>
        </div>
        <SubscribeBtn
          onClick={() => {
            if (!user) return;
            const uploader = getUploader(video);
            const next = toggleSubscription(user, {
              channelName: uploader.name || "Unknown",
              channelAvatar: uploader.avatarUrl || null,
            });
            setSubscribed(next.some((item) => item.channelName === uploader.name));
          }}
          className={`font-semibold tracking-tight px-3 py-2 rounded-full transition ${subscribed ? 'bg-gray-500 hover:bg-gray-400' : 'bg-red-600 hover:bg-red-700'} text-white`}
        >
          {subscribed ? 'Followed' : 'Subscribe'}
        </SubscribeBtn>

        <div className="flex items-center bg-[#222222] rounded-full overflow-hidden tracking-tight ml-auto">
          {iconProp.map((btn, idx) => {
            const isActive = activeIcon === btn.keyId;
            return (
              <React.Fragment key={btn.keyId}>
                <button
                  className="flex flex-row gap-2 items-center justify-center font-semibold bg-[#222222] px-3 py-2 rounded-full cursor-pointer"
                  onClick={() =>
                    setActiveIcon(isActive ? null : btn.keyId)
                  }
                >
                  <btn.ico
                    fill={isActive ? "white" : "none"}
                    color={isActive ? "#87CEFA" : "gray"}
                    strokeWidth={isActive ? 1 : 1}
                    className="transition-all duration-200 hover:opacity-50"
                  />
                  {idx === 0 ? video.liked || 8386 : ""}
                </button>

                {idx === 0 && (
                  <div className="w-[1px] h-6 bg-[#444444]" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <button className="flex gap-2 items-center font-semibold bg-[#222222] px-2.5 py-2 rounded-full">
          <Redo2 />
          Share
        </button>

        <button className="flex gap-2 items-center font-semibold bg-[#222222] px-2.5 py-2 rounded-full">
          <SiGooglegemini size={20} />
          Ask question
        </button>

        <button onClick={() => { 
          try{
            if (user) { 
              addWatchLater(user, video); 
              notifySuccess("Video saved");
            } 
            else notifyError("You must login to continue"); 
          }
          catch(err){
            notifyError(`Saved failed: ${err.message}`);
          }
        }} className="flex gap-2 items-center font-semibold bg-[#222222] px-2.5 py-2 rounded-full">
          <Bookmark />
          Save
        </button>

        <button className="flex items-center justify-center bg-[#222222] rounded-full w-[40px] h-[40px]">
          <Ellipsis />
        </button>
      </div>

      <div className="bg-[#222222] p-3 rounded-xl mb-2 h-fit leading-tight">
        <div className="flex items-center gap-4 text-md tracking-tighter font-semibold">
          <span>{video.views || 8386} lượt xem</span>
          <span>{displayTimeFromDB(video.createdAt)}</span>
        </div>

        <div className={`mt-2 text-md leading-6 text-[#f1f1f1] whitespace-pre-wrap text-left ${!expandDesc && "line-clamp-2"}`}>
          {video.description || "No description available."}
        </div>

        <button onClick={() => setExpandDesc(!expandDesc)}
          className="mt-1 text-sm font-semibold hover:text-gray-300"
        >
          {expandDesc ? "Show less" : "... More"}
        </button>
      </div>
    </>
  );

  const Sidebar = ({ className = "" }) => (
    <div className={className}>
      <div className="flex flex-col gap-2">
        {recommendedVideos.map((videoItem) => (
          <VideoCard
            key={videoItem.videoId}
            video={videoItem}
            isCurrent={videoItem.videoId === id}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full px-4 xl:px-6">
      {!isTheaterMode ? (
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 max-w-[calc(100%-402px)] ml-[25px]">
            <VideoPlayer
              ref={playerRef}
              videoPath={`${prefix}/${video.hlsPath}`}
              thumbnailUrl={`${prefix}/${video.thumbnailUrl}/thumbnail.jpg`}
              isTheaterMode={isTheaterMode}
              toggleTheater={toggleTheater}
              onVideoEnded={handleVideoEnded}
              isAutoPlay={isAutoPlay}
              setIsAutoPlay={setIsAutoPlay}
              countdown={countdown}
              setCountdown={setCountdown}
              nextVideo={nextPreview}
            />

            <div className="mt-3">
              <VideoDetails />
            </div>
          </div>

          <Sidebar className="w-[402px] shrink-0 pt-1" />
        </div>
      ) : (
        <div>
          <div className="w-full">
            <VideoPlayer
              ref={playerRef}
              videoPath={`${prefix}/${video.hlsPath}`}
              thumbnailUrl={`${prefix}/${video.thumbnailUrl}/thumbnail.jpg`}
              isTheaterMode={isTheaterMode}
              toggleTheater={toggleTheater}
              onVideoEnded={handleVideoEnded}
              isAutoPlay={isAutoPlay}
              setIsAutoPlay={setIsAutoPlay}
              countdown={countdown}
              setCountdown={setCountdown}
              nextVideo={nextPreview}
            />
          </div>

          <div className="flex gap-6 items-start mt-3">
            <div className="flex-1 min-w-0">
              <VideoDetails />
            </div>

            <Sidebar className="w-[450px] shrink-0 pt-1" />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPage;
