import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import VideoPlayer from '../components/VideoPlayer';
import Navbar from '../components/Navbar';
import { processedStorageBase } from '../utils/storageUrl.js';
import { apiBase } from '../service/apiBase.js';

const VideoPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoData, setVideoData] = useState(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [isAutoPlay, setIsAutoPlay] = useState(true); 
  const [countdown, setCountdown] = useState(null); 
  const timerRef = useRef(null);
  
  const hostPath = `${apiBase}/videos`;
  const videoPrefix = processedStorageBase;

  const nextVideoId = Number(id) + 1; 

  useEffect(() => {
    const fetchVideoDetail = async () => {
      try {
        setCountdown(null); 
        if (timerRef.current) clearInterval(timerRef.current);

        const response = await fetch(`${hostPath}/${id}`);
        const data = await response.json();
        setVideoData(data);
      } 
      catch (err) {
        console.error("Error get detailed video:", err);
      } 
      finally {
        setLoading(false);
      }
    };
    fetchVideoDetail();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  const handleVideoEnded = () => {
    if (!isAutoPlay) return; 
    setCountdown(15); 
  };

  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      navigate(`/video/${nextVideoId}`);
      return;
    }

    timerRef.current = setTimeout(() => {
      setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown, navigate, nextVideoId]);

  const cancelCountdown = () => {
    setCountdown(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (loading) return <div className="text-white">Loading...</div>;
  if (!videoData) return <div className="text-white">Video not found.</div>;

  return (
    <div className="bg-[#0f0f0f] min-h-screen">
      <Navbar />
      <div className={`pt-14 transition-all duration-300 ${isTheaterMode ? 'flex flex-col' : 'flex flex-row gap-6 px-10'}`}>
        
        <div className={`${isTheaterMode ? 'w-full' : 'w-[70%] mt-6'}`}>
          <VideoPlayer 
            videoPath={`${videoPrefix}/${videoData.hlsPath}`} 
            thumbnailUrl={`${videoPrefix}/${videoData.thumbnailUrl}`}
            isTheaterMode={isTheaterMode}
            toggleTheater={() => setIsTheaterMode(!isTheaterMode)}
            onVideoEnded={handleVideoEnded} 
            isAutoPlay={isAutoPlay} 
            setIsAutoPlay={setIsAutoPlay}
          />
          
          <div className={`mt-4 text-white ${isTheaterMode ? 'px-10 pb-10' : ''}`}>
            <h1 className="text-xl font-bold">{videoData.title}</h1>
            
            {countdown !== null && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-xl flex items-center justify-between border border-zinc-800 animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-sm font-medium text-zinc-300">
                    Next video will play in <span className="text-red-500 font-bold text-base px-1">{countdown}</span> seconds...
                  </p>
                </div>
                <button 
                  onClick={cancelCountdown}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-full transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={`${isTheaterMode ? 'w-full px-10' : 'w-[30%] mt-6'}`}>
          <div className="flex items-center justify-between text-white mb-3">
            <span className="font-bold text-sm">Next video</span>
          </div>
          <div className="bg-[#272727] h-20 rounded-lg mb-2"></div>
          <div className="bg-[#272727] h-20 rounded-lg mb-2"></div>
        </div>
      </div>
    </div>
  );
};

export default VideoPage;
