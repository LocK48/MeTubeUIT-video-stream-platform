import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play } from 'lucide-react';
import { timeAgo, displayDuration } from '../utils/cal_in4';
import { formatOut } from '../../../../worker_server/src/util/helper.js';
import { processedStorageBase } from '../utils/storageUrl.js';
import { apiBase } from '../service/apiBase.js';

const hostPath = `${apiBase}/videos`;
const videoPrefix = processedStorageBase;

const SearchPage = () => {
  const location = useLocation();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const query = useMemo(() => new URLSearchParams(location.search).get('q')?.trim() || '', [location.search]);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const response = await fetch(hostPath);
        const data = await response.json();
        setVideos(data || []);
      } catch (err) {
        console.error('Search failed:', err);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [query]);

  const filtered = useMemo(() => {
    if (!query) return [];
    return videos.filter((video) => {
      const text = `${video.title || ''} ${video.description || ''} ${video.channelName || ''} ${video.userId?.name || ''}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
  }, [query, videos]);

  return (
    <div className="max-w-7xl mx-auto px-2 py-4">
      <div className="mb-6">
        <h1 className="ml-2 text-3xl font-bold mb-4">Kết quả tìm kiếm</h1>
        <p className="ml-2 text-md text-[#c0c0c0]">Từ khóa: <span className="font-semibold text-white">{query || '---'}</span></p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40 text-white">Đang tìm kiếm...</div>
      ) : !query ? (
        <div className="rounded-3xl border border-[#272727] bg-[#121212] p-6 text-[#c0c0c0]">
          Nhập nội dung tìm kiếm trong thanh tìm kiếm để bắt đầu.
        </div>
      ) : filtered.length === 0 ? (
        <div className="w-fit rounded-3xl border-none bg-[#121212] p-3 text-blue-300">
          Không tìm thấy video nào cho "{query}".
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((video) => (
            <Link
              key={video.videoId}
              to={`/video/${video.videoId}`}
              className="group overflow-hidden rounded-3xl bg-[#111111] hover:bg-[#1e1e1e] transition p-3 no-underline"
            >
              <div className="relative overflow-hidden rounded-2xl bg-[#222222] aspect-video mb-2">
                <img
                  src={`${videoPrefix}/${video.thumbnailUrl}/thumbnail.jpg`}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                {video.duration && (
                  <div className="absolute bottom-3 right-3 rounded-md bg-black/50 px-2 py-1 text-sm text-white font-semibold">
                    {displayDuration(video.duration)}
                  </div>
                )}
              </div>
              <div className="text-white font-semibold text-lg line-clamp-2">{formatOut(video.title, 35)}</div>
              <div className="font-semibold text-[#aaaaaa] text-md mb-1">{(video.userId?.name || video.channelName) || 'UITer'}</div>
              <div className="flex items-center justify-between text-[#777] text-sm font-semibold">
                <span>{video.views || '0'} view{video.views > 1? 's' : ''} • {timeAgo(video.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
