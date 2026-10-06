import { Link } from "react-router-dom";
import { AudioLines } from "lucide-react";
import { timeAgo, displayDuration } from "../utils/cal_in4";
import { miniView } from "../utils/renderSth.jsx";
import { formatOut } from "../../../../worker_server/src/util/helper.js";
import { getUploader } from "../utils/uploader.js";
import { processedStorageBase } from "../utils/storageUrl.js";

const prefix = processedStorageBase;

const VideoCard = ({ video, isCurrent, theaterMode = false }) => {
  /* Check if video is streaming or not */
  return (
    <Link to={`/video/${video.videoId}`} className={`group text-white no-underline ${theaterMode ? "flex flex-col" : "flex gap-2"}`}>
      {/* Thumbnail */}
      <div className={`relative overflow-hidden bg-[#181818] ${theaterMode? "w-full aspect-video rounded-2xl" : "min-w-[180px] max-w-[180px] h-[100px] rounded-xl"}`}>
        {isCurrent && (
            <div className="absolute top-2 left-2 bg-red-400/75 text-white text-[8px] px-2 py-[2px] rounded-full items-center justify-center">
                <AudioLines size={16} color="white" className="animate-pulse"/>
            </div>
            )}
        <img
          src={`${prefix}/${video.thumbnailUrl}/thumbnail.jpg`} alt={video.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute bottom-1 right-1 bg-black/80 text-blue-100 text-[12px] px-1 rounded font-semibold">
          {displayDuration(video.duration)}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col overflow-hidden inter leading-none">
        <h3 className="text-[16px] text-left font-semibold text-blue-200 leading-tight line-clamp-2 tracking-tight">
          {formatOut(video.title, 50)}
        </h3>
        <p className="text-xs text-gray-500 mb-[4px] font-semibold">
          {getUploader(video).name}
        </p>
        <div className="text-xs text-gray-500 flex flex-row gap-x-2">
          <span>{miniView(video.views || 8386)}</span>
          <span>•</span>
          <span>{timeAgo(video.createdAt)}</span>
        </div>
      </div>
      <div>
      </div>
    </Link>
  );
};

export default VideoCard;
