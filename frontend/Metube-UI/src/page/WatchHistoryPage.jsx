import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getWatchHistory } from '../service/userDataService.js';
import { timeAgo } from '../utils/cal_in4.js';
import { formatOut } from '../../../../worker_server/src/util/helper.js';
import { processedStorageBase } from '../utils/storageUrl.js';

const s3_url = processedStorageBase;
const WatchHistoryPage = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(getWatchHistory(user));
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-2 py-4">
        <h1 className="text-3xl font-bold mb-3">Video đã xem</h1>
        <p className="text-md text-blue-300 leading-relaxed mb-4">Bạn cần đăng nhập để tiếp tục.</p>
        <Link to="/login" className="inline-block rounded-lg bg-[#1c62b9] px-5 py-2.5 text-blue-100 no-underline">Đăng nhập</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 py-4">
      <h1 className="text-3xl font-bold mb-3">Video đã xem</h1>
      <p className="text-md text-[#c0c0c0] leading-relaxed mb-6">
        Danh sách các video bạn đã xem sẽ được lưu trữ và hiển thị tại đây.
      </p>

      {history.length === 0 ? (
        <div className="rounded-3xl border-none bg-[#121212] p-6 text-[#c0c0c0]">
          Hiện chưa có lịch sử xem nào. Hãy xem một video để bắt đầu.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history.map((item) => (
            <Link
              to={`/video/${item.videoId}`}
              key={item.videoId}
              className="group overflow-hidden rounded-3xl bg-neutral-800 p-3 no-underline hover:bg-gray-200 transition"
            >
              <div className="flex gap-3 items-center">
                <div className="w-[126px] h-[65px] rounded-xl overflow-hidden bg-[#222222] flex-shrink-0">
                  <img
                    src={`${s3_url}/${item.thumbnailUrl}/thumbnail.jpg`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col space-y-0">
                  <h2 className="text-lg font-semibold text-blue-300 mb-0 leading-none mb-1">{formatOut(item.title, 25)}</h2>
                  <p className="text-sm font-semibold text-gray-500">{item?.channelName || item?.userId?.name || 'Unknown'}</p>
                  <p className="text-sm font-semibold text-[#777]">Xem lần cuối: {timeAgo(item.viewedAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default WatchHistoryPage;
