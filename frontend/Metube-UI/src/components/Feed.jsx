import { Play } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { timeAgo, displayDuration } from "../utils/cal_in4";
import { getUploader } from "../utils/uploader.js";
import { processedStorageBase } from "../utils/storageUrl.js";
import { apiBase } from "../service/apiBase.js";

const hostPath = `${apiBase}/videos`;
const videoPrefix = processedStorageBase;

const Feed = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getVideos = async () => {
      try {
        const response = await fetch(`${hostPath}`);
        const data = await response.json();
        setVideos(data);
      } catch (err) {
        console.error("Error fetching videos:", err);
      } finally {
        setLoading(false);
      }
    };

    getVideos();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0f0f0f] text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white mt-0 px-2">
      {/* Tabs */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
        {[
          "Tất cả",
          "Âm nhạc",
          "Trò chơi",
          "Trực tiếp",
          "Học tập",
          "Tin tức",
          "Mới tải lên gần đây",
        ].map((tab, index) => (
          <button
            key={tab}
            className={`ml-2 flex justify-center items-center whitespace-nowrap px-3 py-1.5 rounded-lg text-[14px] font-medium transition
              ${
                index === 0
                  ? "bg-white text-black"
                  : "bg-[#272727] text-white hover:bg-[#3f3f3f]"
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-2 gap-y-3">
        {videos.map((video) => (
          <Link
            to={`/video/${video.videoId}`}
            key={video.videoId}
            className="group flex flex-col gap-3 no-underline text-inherit hover:bg-[#272727] p-2 rounded-2xl"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#272727]">
              <img
                src={`${videoPrefix}/${video.thumbnailUrl}/thumbnail.jpg`}
                alt={video.title}
                className="w-full h-full object-cover group-hover:scale-105 group-hover:rounded-none transition-all duration-500"
              />

              {video.duration && (
                <div className="absolute bottom-2 right-2 bg-black/50 text-blue-100 text-sm font-medium px-2 py-0.5 rounded-md group-hover:opacity-0">
                  {displayDuration(video.duration)}
                </div>
              )}
            </div>

            {/* Video Info */}
            <div className="flex gap-3 px-1">
              <img
                src={getUploader(video).avatarUrl || "https://tinyurl.com/277pc7ru"}
                alt={getUploader(video).name || "UIT fault"}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />

              <div className="flex flex-col tracking-tight">
                <h3 className="text-lg font-semibold line-clamp-2 leading-snug text-[#f1f1f1] tracking-tight">
                  {video.title}
                </h3>

                <div className="text-md text-[#aaaaaa] leading-none flex flex-col flex-wrap gap-y-1">
                  <p className="hover:text-white transition mb-1">
                    {getUploader(video).name || "Unknown User"}
                  </p>

                  <p className="flex items-center flex-wrap gap-x-1">
                    {video.views || 0} view{video.views > 1? 's' : ''} • {timeAgo(video.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Feed;
